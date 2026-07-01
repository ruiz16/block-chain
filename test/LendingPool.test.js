const { expect } = require('chai');
const { ethers } = require('hardhat');

const ONE = 10n ** 18n;
const CREDIT_ID = ethers.id('credit-uuid-001'); // keccak256 de un string
const MAX = 1000n * ONE;

// Helper: disburse v2 (creditId, borrower, principal, interest, dueDate)
function disb(pool, signer, id, borrower, principal, interest, dueDate = 0) {
  return pool.connect(signer).disburse(id, borrower, principal, interest, dueDate);
}

async function deployFixture() {
  const [owner, disburser, treasury, borrower, payer, attacker] = await ethers.getSigners();

  const Token = await ethers.getContractFactory('MockCopm');
  const token = await Token.deploy('Moneda Local de Confianza', 'COPm');
  await token.waitForDeployment();

  const Pool = await ethers.getContractFactory('LendingPool');
  const pool = await Pool.deploy(
    await token.getAddress(),
    owner.address,
    disburser.address,
    treasury.address,
    MAX,
  );
  await pool.waitForDeployment();

  // Fund the pool with 5,000 COPm via mint + approve + fund
  await token.mint(owner.address, 10000n * ONE);
  await token.connect(owner).approve(await pool.getAddress(), 10000n * ONE);
  await pool.connect(owner).fund(5000n * ONE);

  return { token, pool, owner, disburser, treasury, borrower, payer, attacker };
}

// Deja a `payer` con saldo y allowance para repagar `amount`.
async function fundPayer(token, pool, payer, amount) {
  await token.mint(payer.address, amount);
  await token.connect(payer).approve(await pool.getAddress(), amount);
}

describe('LendingPool v2', () => {
  // ───────────────────────────── Disburse ─────────────────────────────
  it('disburses to borrower fixing interest (totalDue = principal + interest)', async () => {
    const { token, pool, disburser, borrower } = await deployFixture();
    await expect(disb(pool, disburser, CREDIT_ID, borrower.address, 100n * ONE, 20n * ONE, 0))
      .to.emit(pool, 'Disbursed')
      .withArgs(CREDIT_ID, borrower.address, 100n * ONE, 120n * ONE, 0);

    expect(await token.balanceOf(borrower.address)).to.equal(100n * ONE);
    const c = await pool.getCredit(CREDIT_ID);
    expect(c.principal).to.equal(100n * ONE);
    expect(c.totalDue).to.equal(120n * ONE);
    expect(c.totalRepaid).to.equal(0n);
    expect(c.borrower).to.equal(borrower.address);
    expect(c.status).to.equal(1n); // ACTIVE
    expect(await pool.activeCredits()).to.equal(1n);
    expect(await pool.creditCount()).to.equal(1n);
  });

  it('reverts disburse from non-disburser', async () => {
    const { pool, attacker, borrower } = await deployFixture();
    await expect(
      disb(pool, attacker, CREDIT_ID, borrower.address, 100n * ONE, 0n, 0),
    ).to.be.revertedWithCustomError(pool, 'NotDisburser');
  });

  it('reverts disburse above the cap', async () => {
    const { pool, disburser, borrower } = await deployFixture();
    await expect(
      disb(pool, disburser, CREDIT_ID, borrower.address, MAX + 1n, 0n, 0),
    ).to.be.revertedWithCustomError(pool, 'AmountExceedsCap');
  });

  it('reverts duplicate disburse for same creditId', async () => {
    const { pool, disburser, borrower } = await deployFixture();
    await disb(pool, disburser, CREDIT_ID, borrower.address, 100n * ONE, 10n * ONE, 0);
    await expect(
      disb(pool, disburser, CREDIT_ID, borrower.address, 50n * ONE, 0n, 0),
    ).to.be.revertedWithCustomError(pool, 'CreditAlreadyExists');
  });

  it('reverts disburse without enough liquidity (availableLiquidity excludes interest)', async () => {
    const { token, owner, disburser, treasury, borrower } = await deployFixture();
    // Pool nuevo fondeado con poco
    const Pool = await ethers.getContractFactory('LendingPool');
    const poolLow = await Pool.deploy(
      await token.getAddress(), owner.address, disburser.address, treasury.address, MAX,
    );
    await poolLow.waitForDeployment();
    await token.connect(owner).approve(await poolLow.getAddress(), 50n * ONE);
    await poolLow.connect(owner).fund(50n * ONE);

    await expect(
      poolLow.connect(disburser).disburse(CREDIT_ID, borrower.address, 100n * ONE, 0n, 0),
    ).to.be.revertedWithCustomError(poolLow, 'InsufficientLiquidity');
  });

  // ───────────────────────────── Repay ────────────────────────────────
  it('repays capital-first; interest accrues to pendingInterest; caps at totalDue (no overpay)', async () => {
    const { token, pool, disburser, treasury, borrower, payer } = await deployFixture();
    // principal 100, interés 20 → totalDue 120
    await disb(pool, disburser, CREDIT_ID, borrower.address, 100n * ONE, 20n * ONE, 0);
    await fundPayer(token, pool, payer, 200n * ONE);

    // Pago 1: 40 → todo capital (principalPart 40, interestPart 0)
    await expect(pool.connect(payer).repay(CREDIT_ID, 40n * ONE))
      .to.emit(pool, 'Repaid')
      .withArgs(CREDIT_ID, payer.address, 40n * ONE, 40n * ONE, 0n, 40n * ONE);
    expect(await pool.pendingInterest()).to.equal(0n);

    // Pago 2: 70 → 60 capital + 10 interés (capital llega a 100)
    await expect(pool.connect(payer).repay(CREDIT_ID, 70n * ONE))
      .to.emit(pool, 'Repaid')
      .withArgs(CREDIT_ID, payer.address, 70n * ONE, 60n * ONE, 10n * ONE, 110n * ONE);
    expect(await pool.pendingInterest()).to.equal(10n * ONE);

    // Pago 3: intento 50 pero solo quedan 10 → accepted 10 (todo interés), REPAID
    await expect(pool.connect(payer).repay(CREDIT_ID, 50n * ONE))
      .to.emit(pool, 'Repaid')
      .withArgs(CREDIT_ID, payer.address, 10n * ONE, 0n, 10n * ONE, 120n * ONE)
      .and.to.emit(pool, 'CreditFullyRepaid')
      .withArgs(CREDIT_ID);

    const c = await pool.getCredit(CREDIT_ID);
    expect(c.totalRepaid).to.equal(120n * ONE);
    expect(c.status).to.equal(2n); // REPAID
    expect(await pool.pendingInterest()).to.equal(20n * ONE);
    expect(await pool.activeCredits()).to.equal(0n);

    // Pago 4: ya saldado → revierte
    await expect(
      pool.connect(payer).repay(CREDIT_ID, 1n * ONE),
    ).to.be.revertedWithCustomError(pool, 'CreditAlreadyRepaid');

    // Invariante de liquidez: balance - pendingInterest
    const bal = await token.balanceOf(await pool.getAddress());
    expect(await pool.availableLiquidity()).to.equal(bal - 20n * ONE);
    void treasury;
  });

  it('reverts repay for unknown credit', async () => {
    const { token, pool, payer } = await deployFixture();
    await fundPayer(token, pool, payer, 10n * ONE);
    await expect(
      pool.connect(payer).repay(ethers.id('does-not-exist'), 10n * ONE),
    ).to.be.revertedWithCustomError(pool, 'CreditNotFound');
  });

  // ─────────────────────────── sweepInterest ──────────────────────────
  it('sweepInterest moves all pendingInterest to treasury; permissionless; NothingToSweep when 0', async () => {
    const { token, pool, disburser, treasury, borrower, payer, attacker } = await deployFixture();
    await disb(pool, disburser, CREDIT_ID, borrower.address, 100n * ONE, 20n * ONE, 0);
    await fundPayer(token, pool, payer, 120n * ONE);
    await pool.connect(payer).repay(CREDIT_ID, 120n * ONE); // pendingInterest = 20

    const treBefore = await token.balanceOf(treasury.address);
    // Lo dispara `attacker` (cualquiera) — destino fijo, sin riesgo de fuga.
    await expect(pool.connect(attacker).sweepInterest())
      .to.emit(pool, 'InterestSwept')
      .withArgs(treasury.address, 20n * ONE);

    expect(await token.balanceOf(treasury.address)).to.equal(treBefore + 20n * ONE);
    expect(await pool.pendingInterest()).to.equal(0n);
    expect(await pool.totalInterestSwept()).to.equal(20n * ONE);

    // Segundo barrido sin interés pendiente → revierte
    await expect(pool.connect(attacker).sweepInterest())
      .to.be.revertedWithCustomError(pool, 'NothingToSweep');
  });

  // ──────────────────────────── markDefaulted ─────────────────────────
  it('markDefaulted: ACTIVE→DEFAULTED, sigue aceptando recuperaciones hasta REPAID', async () => {
    const { token, pool, disburser, borrower, payer } = await deployFixture();
    await disb(pool, disburser, CREDIT_ID, borrower.address, 100n * ONE, 20n * ONE, 0);

    await expect(pool.connect(disburser).markDefaulted(CREDIT_ID))
      .to.emit(pool, 'CreditDefaulted')
      .withArgs(CREDIT_ID, 100n * ONE); // capital vivo
    expect((await pool.getCredit(CREDIT_ID)).status).to.equal(3n); // DEFAULTED
    expect(await pool.activeCredits()).to.equal(0n);

    // No se puede re-marcar (ya no está ACTIVE)
    await expect(
      pool.connect(disburser).markDefaulted(CREDIT_ID),
    ).to.be.revertedWithCustomError(pool, 'CreditNotActive');

    // Pero un DEFAULTED sí puede repagar hasta REPAID (recuperación)
    await fundPayer(token, pool, payer, 120n * ONE);
    await expect(pool.connect(payer).repay(CREDIT_ID, 120n * ONE))
      .to.emit(pool, 'CreditFullyRepaid')
      .withArgs(CREDIT_ID);
    expect((await pool.getCredit(CREDIT_ID)).status).to.equal(2n); // REPAID
  });

  // ───────────────────────────── Pausable ─────────────────────────────
  it('pause stops new disbursements; repays still work; unpause restores', async () => {
    const { token, pool, owner, disburser, borrower, payer } = await deployFixture();
    await disb(pool, disburser, CREDIT_ID, borrower.address, 100n * ONE, 0n, 0);

    await pool.connect(owner).pause();
    await expect(
      disb(pool, disburser, ethers.id('credit-2'), borrower.address, 50n * ONE, 0n, 0),
    ).to.be.revertedWithCustomError(pool, 'EnforcedPause');

    // Repago sigue funcionando aunque esté pausado
    await fundPayer(token, pool, payer, 100n * ONE);
    await pool.connect(payer).repay(CREDIT_ID, 100n * ONE);

    await pool.connect(owner).unpause();
    await expect(
      disb(pool, disburser, ethers.id('credit-2'), borrower.address, 50n * ONE, 0n, 0),
    ).to.emit(pool, 'Disbursed');
  });

  // ──────────────────────────── Administración ────────────────────────
  it('admin: only owner sets disburser/treasury/cap', async () => {
    const { pool, owner, attacker, payer } = await deployFixture();
    await expect(pool.connect(attacker).setDisburser(payer.address))
      .to.be.revertedWithCustomError(pool, 'OwnableUnauthorizedAccount');
    await expect(pool.connect(owner).setTreasury(payer.address))
      .to.emit(pool, 'TreasuryChanged');
    await expect(pool.connect(owner).setMaxDisbursement(2000n * ONE))
      .to.emit(pool, 'MaxDisbursementChanged');
    expect(await pool.treasury()).to.equal(payer.address);
  });

  it('Ownable2Step: ownership transfers only after acceptance', async () => {
    const { pool, owner, attacker } = await deployFixture();
    await pool.connect(owner).transferOwnership(attacker.address);
    // Aún no transferida hasta que el nuevo dueño acepte
    expect(await pool.owner()).to.equal(owner.address);
    expect(await pool.pendingOwner()).to.equal(attacker.address);
    await pool.connect(attacker).acceptOwnership();
    expect(await pool.owner()).to.equal(attacker.address);
  });

  // ──────────────────────────── voidCredit ───────────────────────────
  it('voidCredit: anula un crédito ACTIVE sin repagos (limpia contabilidad)', async () => {
    const { pool, disburser, borrower } = await deployFixture();
    await disb(pool, disburser, CREDIT_ID, borrower.address, 100n * ONE, 20n * ONE, 0);
    expect(await pool.activeCredits()).to.equal(1n);

    await expect(pool.connect(disburser).voidCredit(CREDIT_ID))
      .to.emit(pool, 'CreditVoided')
      .withArgs(CREDIT_ID);

    expect((await pool.getCredit(CREDIT_ID)).status).to.equal(4n); // VOIDED
    expect(await pool.activeCredits()).to.equal(0n);
  });

  it('voidCredit: revierte si ya hubo un repago', async () => {
    const { token, pool, disburser, borrower, payer } = await deployFixture();
    await disb(pool, disburser, CREDIT_ID, borrower.address, 100n * ONE, 20n * ONE, 0);
    await fundPayer(token, pool, payer, 10n * ONE);
    await pool.connect(payer).repay(CREDIT_ID, 10n * ONE);

    await expect(
      pool.connect(disburser).voidCredit(CREDIT_ID),
    ).to.be.revertedWithCustomError(pool, 'CannotVoidWithRepayments');
  });

  it('voidCredit: revierte si el crédito no está ACTIVE', async () => {
    const { pool, disburser, borrower } = await deployFixture();
    await disb(pool, disburser, CREDIT_ID, borrower.address, 100n * ONE, 0n, 0);
    await pool.connect(disburser).voidCredit(CREDIT_ID);
    // segundo intento: ya está VOIDED, no ACTIVE
    await expect(
      pool.connect(disburser).voidCredit(CREDIT_ID),
    ).to.be.revertedWithCustomError(pool, 'CreditNotActive');
  });

  it('voidCredit: revierte si lo llama un tercero (no disburser ni owner)', async () => {
    const { pool, disburser, borrower, attacker } = await deployFixture();
    await disb(pool, disburser, CREDIT_ID, borrower.address, 100n * ONE, 0n, 0);
    await expect(
      pool.connect(attacker).voidCredit(CREDIT_ID),
    ).to.be.revertedWithCustomError(pool, 'NotAuthorized');
  });

  it('un crédito VOIDED rechaza repay', async () => {
    const { token, pool, disburser, borrower, payer } = await deployFixture();
    await disb(pool, disburser, CREDIT_ID, borrower.address, 100n * ONE, 20n * ONE, 0);
    await pool.connect(disburser).voidCredit(CREDIT_ID);
    await fundPayer(token, pool, payer, 10n * ONE);
    await expect(
      pool.connect(payer).repay(CREDIT_ID, 10n * ONE),
    ).to.be.revertedWithCustomError(pool, 'CreditIsVoided');
  });

  // ───────────────────────────── forgive ─────────────────────────────
  it('forgive parcial: reduce totalDue, el crédito sigue ACTIVE', async () => {
    const { pool, disburser, borrower } = await deployFixture();
    // principal 100, interés 20 → totalDue 120
    await disb(pool, disburser, CREDIT_ID, borrower.address, 100n * ONE, 20n * ONE, 0);

    // Condona una "cuota" de 30
    await expect(pool.connect(disburser).forgive(CREDIT_ID, 30n * ONE))
      .to.emit(pool, 'CreditForgiven')
      .withArgs(CREDIT_ID, 30n * ONE, 90n * ONE);

    const c = await pool.getCredit(CREDIT_ID);
    expect(c.totalDue).to.equal(90n * ONE);
    expect(c.status).to.equal(1n); // sigue ACTIVE
    expect(await pool.activeCredits()).to.equal(1n);
  });

  it('forgive del saldo restante: cierra el crédito (REPAID)', async () => {
    const { token, pool, disburser, borrower, payer } = await deployFixture();
    await disb(pool, disburser, CREDIT_ID, borrower.address, 100n * ONE, 20n * ONE, 0);
    await fundPayer(token, pool, payer, 90n * ONE);
    await pool.connect(payer).repay(CREDIT_ID, 90n * ONE); // repaid 90, remaining 30

    // Condona los 30 que faltan → repaid(90) == newDue(90) → REPAID
    await expect(pool.connect(disburser).forgive(CREDIT_ID, 30n * ONE))
      .to.emit(pool, 'CreditForgiven')
      .withArgs(CREDIT_ID, 30n * ONE, 90n * ONE)
      .and.to.emit(pool, 'CreditFullyRepaid')
      .withArgs(CREDIT_ID);

    const c = await pool.getCredit(CREDIT_ID);
    expect(c.status).to.equal(2n); // REPAID
    expect(await pool.activeCredits()).to.equal(0n);
  });

  it('forgive parcial y luego el prestatario paga el resto → cierra al nuevo total', async () => {
    const { token, pool, disburser, borrower, payer } = await deployFixture();
    await disb(pool, disburser, CREDIT_ID, borrower.address, 100n * ONE, 20n * ONE, 0);
    await pool.connect(disburser).forgive(CREDIT_ID, 20n * ONE); // totalDue 120 → 100
    await fundPayer(token, pool, payer, 100n * ONE);

    await expect(pool.connect(payer).repay(CREDIT_ID, 100n * ONE))
      .to.emit(pool, 'CreditFullyRepaid')
      .withArgs(CREDIT_ID);
    expect((await pool.getCredit(CREDIT_ID)).status).to.equal(2n); // REPAID
  });

  it('forgive revierte si el monto supera el saldo pendiente', async () => {
    const { pool, disburser, borrower } = await deployFixture();
    await disb(pool, disburser, CREDIT_ID, borrower.address, 100n * ONE, 20n * ONE, 0);
    await expect(
      pool.connect(disburser).forgive(CREDIT_ID, 121n * ONE),
    ).to.be.revertedWithCustomError(pool, 'CannotForgiveMoreThanRemaining');
  });

  it('forgive revierte si lo llama un tercero', async () => {
    const { pool, disburser, borrower, attacker } = await deployFixture();
    await disb(pool, disburser, CREDIT_ID, borrower.address, 100n * ONE, 20n * ONE, 0);
    await expect(
      pool.connect(attacker).forgive(CREDIT_ID, 10n * ONE),
    ).to.be.revertedWithCustomError(pool, 'NotAuthorized');
  });

  it('emergencyWithdraw: reverts on zero, emits on success', async () => {
    const { token, pool, owner, borrower } = await deployFixture();
    await expect(
      pool.connect(owner).emergencyWithdraw(borrower.address, 0n),
    ).to.be.revertedWithCustomError(pool, 'ZeroAmount');
    await expect(pool.connect(owner).emergencyWithdraw(borrower.address, 10n * ONE))
      .to.emit(pool, 'EmergencyWithdrawn')
      .withArgs(borrower.address, 10n * ONE);
    expect(await token.balanceOf(borrower.address)).to.equal(10n * ONE);
  });
});
