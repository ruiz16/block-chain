const { expect } = require('chai');
const { ethers } = require('hardhat');

const ONE = 10n ** 18n;
const CREDIT_ID = ethers.id('credit-uuid-001'); // keccak256 de un string
const MAX = 1000n * ONE;

async function deployFixture() {
  const [owner, disburser, borrower, payer, attacker] = await ethers.getSigners();

  const Token = await ethers.getContractFactory('MockCopm');
  const token = await Token.deploy('Moneda Local de Confianza', 'COPm');
  await token.waitForDeployment();

  const Pool = await ethers.getContractFactory('LendingPool');
  const pool = await Pool.deploy(
    await token.getAddress(),
    owner.address,
    disburser.address,
    MAX,
  );
  await pool.waitForDeployment();

  // Fund the pool with 5,000 COPm via mint + approve + fund
  await token.mint(owner.address, 10000n * ONE);
  await token.connect(owner).approve(await pool.getAddress(), 10000n * ONE);
  await pool.connect(owner).fund(5000n * ONE);

  return { token, pool, owner, disburser, borrower, payer, attacker };
}

describe('LendingPool', () => {
  it('disburses to borrower and records the credit', async () => {
    const { token, pool, disburser, borrower } = await deployFixture();
    await expect(pool.connect(disburser).disburse(CREDIT_ID, borrower.address, 100n * ONE))
      .to.emit(pool, 'Disbursed')
      .withArgs(CREDIT_ID, borrower.address, 100n * ONE);
    expect(await token.balanceOf(borrower.address)).to.equal(100n * ONE);
    const c = await pool.credits(CREDIT_ID);
    expect(c.exists).to.equal(true);
    expect(c.amount).to.equal(100n * ONE);
  });

  it('reverts disburse from non-disburser', async () => {
    const { pool, attacker, borrower } = await deployFixture();
    await expect(
      pool.connect(attacker).disburse(CREDIT_ID, borrower.address, 100n * ONE),
    ).to.be.revertedWithCustomError(pool, 'NotDisburser');
  });

  it('reverts disburse above the cap', async () => {
    const { pool, disburser, borrower } = await deployFixture();
    await expect(
      pool.connect(disburser).disburse(CREDIT_ID, borrower.address, MAX + 1n),
    ).to.be.revertedWithCustomError(pool, 'AmountExceedsCap');
  });

  it('reverts duplicate disburse for same creditId', async () => {
    const { pool, disburser, borrower } = await deployFixture();
    await pool.connect(disburser).disburse(CREDIT_ID, borrower.address, 100n * ONE);
    await expect(
      pool.connect(disburser).disburse(CREDIT_ID, borrower.address, 50n * ONE),
    ).to.be.revertedWithCustomError(pool, 'CreditAlreadyExists');
  });

  it('repays a credit and emits Repaid with running total', async () => {
    const { token, pool, disburser, borrower, payer } = await deployFixture();
    await pool.connect(disburser).disburse(CREDIT_ID, borrower.address, 100n * ONE);
    await token.mint(payer.address, 100n * ONE);
    await token.connect(payer).approve(await pool.getAddress(), 100n * ONE);

    await expect(pool.connect(payer).repay(CREDIT_ID, 40n * ONE))
      .to.emit(pool, 'Repaid')
      .withArgs(CREDIT_ID, payer.address, 40n * ONE, 40n * ONE);

    const c1 = await pool.credits(CREDIT_ID);
    expect(c1.totalRepaid).to.equal(40n * ONE);

    await pool.connect(payer).repay(CREDIT_ID, 60n * ONE);
    const c2 = await pool.credits(CREDIT_ID);
    expect(c2.totalRepaid).to.equal(100n * ONE);
  });

  it('allows repaying ABOVE the principal (interest) — totalRepaid exceeds amount', async () => {
    const { token, pool, disburser, borrower, payer } = await deployFixture();
    await pool.connect(disburser).disburse(CREDIT_ID, borrower.address, 100n * ONE);
    await token.mint(payer.address, 130n * ONE);
    await token.connect(payer).approve(await pool.getAddress(), 130n * ONE);

    await pool.connect(payer).repay(CREDIT_ID, 100n * ONE);
    await expect(pool.connect(payer).repay(CREDIT_ID, 30n * ONE))
      .to.emit(pool, 'Repaid')
      .withArgs(CREDIT_ID, payer.address, 30n * ONE, 130n * ONE);

    const c = await pool.credits(CREDIT_ID);
    expect(c.totalRepaid).to.equal(130n * ONE);
  });

  it('reverts repay for unknown credit', async () => {
    const { token, pool, payer } = await deployFixture();
    await token.mint(payer.address, 10n * ONE);
    await token.connect(payer).approve(await pool.getAddress(), 10n * ONE);
    await expect(
      pool.connect(payer).repay(ethers.id('does-not-exist'), 10n * ONE),
    ).to.be.revertedWithCustomError(pool, 'CreditNotFound');
  });

  it('only owner can set disburser and cap', async () => {
    const { pool, owner, attacker, payer } = await deployFixture();
    await expect(pool.connect(attacker).setDisburser(payer.address))
      .to.be.revertedWithCustomError(pool, 'OwnableUnauthorizedAccount');
    await expect(pool.connect(owner).setMaxDisbursement(2000n * ONE))
      .to.emit(pool, 'MaxDisbursementChanged');
  });

  it('withdraw reverts on zero amount and emits Withdrawn on success', async () => {
    const { token, pool, owner, borrower } = await deployFixture();
    await expect(
      pool.connect(owner).withdraw(borrower.address, 0n),
    ).to.be.revertedWithCustomError(pool, 'ZeroAmount');
    await expect(pool.connect(owner).withdraw(borrower.address, 10n * ONE))
      .to.emit(pool, 'Withdrawn')
      .withArgs(borrower.address, 10n * ONE);
    expect(await token.balanceOf(borrower.address)).to.equal(10n * ONE);
  });
});
