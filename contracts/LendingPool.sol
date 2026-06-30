// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title  LendingPool
 * @notice Fondo rotatorio de COPm para Mangle, diseñado para una fundación que
 *         únicamente quiere FONDEAR y AUTOMATIZAR. El contrato es el escrow:
 *
 *           - fund():            carga COPm al pool (cualquiera).
 *           - disburse():        desembolsa un crédito; solo `disburser`. El interés
 *                                se FIJA aquí: totalDue = principal + interés.
 *           - repay():           repaga capital + interés; tope automático en el saldo,
 *                                imposible sobre-pagar. El capital recuperado vuelve a la
 *                                liquidez (fondo rotatorio); el interés se acumula aparte.
 *           - sweepInterest():   "barre" el interés acumulado hacia `treasury` (la
 *                                fundación). Permissionless: el destino es fijo, así que
 *                                un bot —o cualquiera— puede dispararlo sin riesgo.
 *
 *         Modelo de interés: FIJO al desembolso (no se acumula con el tiempo). Tu sistema
 *         off-chain calcula el plan de cuotas en la DB; el contrato solo garantiza que no
 *         se repague más que `totalDue` y enruta el excedente sobre el capital a la
 *         fundación. Si quisieras interés por tiempo (APR/mora on-chain) es otro modelo.
 *
 *         Gobernanza:
 *           - owner   -> idealmente un multisig. Administra roles, cap, tesorería, pausa
 *                        y retiros de emergencia. Transferencia de propiedad en 2 pasos.
 *           - disburser -> wallet caliente automatizada que ejecuta los desembolsos.
 *           - treasury  -> dónde aterrizan los intereses (puede ser el propio owner).
 *
 *         Supuesto del token: COPm es un ERC-20 estándar de Mento (18 decimales, sin
 *         fee-on-transfer ni rebase). La contabilidad asume que `transfer/transferFrom`
 *         mueve exactamente el monto indicado.
 */
contract LendingPool is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ───────────────────────────── Token ─────────────────────────────
    IERC20 public immutable copm;

    // ─────────────────────────── Roles / params ──────────────────────
    address public disburser;       // wallet automatizada que desembolsa
    address public treasury;        // destino del interés barrido (la fundación)
    uint256 public maxDisbursement; // cap de capital por crédito

    // ─────────────────────────── Créditos ────────────────────────────
    enum Status {
        NONE,      // no existe
        ACTIVE,    // desembolsado, en repago
        REPAID,    // totalDue alcanzado
        DEFAULTED  // marcado en mora (sigue aceptando recuperaciones)
    }

    /// @dev Empaquetado en 3 slots. uint128 sobra para montos COP (1 000M COP ≈ 1e27 < 3.4e38).
    struct Credit {
        uint128 principal;    // capital entregado al prestatario
        uint128 totalDue;     // principal + interés (tope de repago)
        uint128 totalRepaid;  // repagado acumulado (capital + interés), tope = totalDue
        uint64  disbursedAt;  // timestamp del desembolso
        uint64  dueDate;      // vencimiento (0 = sin fecha; el cronograma vive off-chain)
        address borrower;     // prestatario
        Status  status;
    }

    mapping(bytes32 => Credit) public credits;

    // ─────────────────────── Contabilidad global ─────────────────────
    uint256 public pendingInterest;        // interés cobrado, aún sin barrer al treasury
    uint256 public totalFunded;            // COPm fondeado (acumulado)
    uint256 public totalDisbursed;         // capital desembolsado (acumulado)
    uint256 public totalPrincipalRepaid;   // capital recuperado (acumulado)
    uint256 public totalInterestCollected; // interés cobrado (acumulado)
    uint256 public totalInterestSwept;     // interés barrido al treasury (acumulado)
    uint256 public creditCount;            // créditos creados (acumulado)
    uint256 public activeCredits;          // créditos en estado ACTIVE

    // ───────────────────────────── Eventos ───────────────────────────
    event Funded(address indexed from, uint256 amount);
    event Disbursed(
        bytes32 indexed creditId,
        address indexed borrower,
        uint256 principal,
        uint256 totalDue,
        uint64 dueDate
    );
    event Repaid(
        bytes32 indexed creditId,
        address indexed payer,
        uint256 accepted,
        uint256 principalPart,
        uint256 interestPart,
        uint256 totalRepaid
    );
    event CreditFullyRepaid(bytes32 indexed creditId);
    event CreditDefaulted(bytes32 indexed creditId, uint256 outstandingPrincipal);
    event InterestSwept(address indexed to, uint256 amount);
    event DisburserChanged(address indexed previous, address indexed current);
    event TreasuryChanged(address indexed previous, address indexed current);
    event MaxDisbursementChanged(uint256 previous, uint256 current);
    event EmergencyWithdrawn(address indexed to, uint256 amount);

    // ───────────────────────────── Errores ───────────────────────────
    error NotDisburser();
    error NotAuthorized();
    error CreditAlreadyExists();
    error CreditNotFound();
    error CreditNotActive();
    error CreditAlreadyRepaid();
    error ZeroAmount();
    error ZeroAddress();
    error AmountExceedsCap();
    error InsufficientLiquidity();
    error NothingToSweep();
    error InvalidLoanTerms();

    // ──────────────────────────── Modifiers ──────────────────────────
    modifier onlyDisburser() {
        if (msg.sender != disburser) revert NotDisburser();
        _;
    }

    modifier onlyDisburserOrOwner() {
        if (msg.sender != disburser && msg.sender != owner()) revert NotAuthorized();
        _;
    }

    // ─────────────────────────── Constructor ─────────────────────────
    constructor(
        address _copm,
        address _owner,
        address _disburser,
        address _treasury,
        uint256 _maxDisbursement
    ) Ownable(_owner) {
        if (_copm == address(0) || _disburser == address(0) || _treasury == address(0)) {
            revert ZeroAddress();
        }
        copm = IERC20(_copm);
        disburser = _disburser;
        treasury = _treasury;
        maxDisbursement = _maxDisbursement;
    }

    // ════════════════════════════ Liquidez ═══════════════════════════

    /// @notice COPm disponible para desembolsar. EXCLUYE el interés pendiente de barrer,
    ///         que ya pertenece a la fundación y nunca debe re-prestarse.
    function availableLiquidity() public view returns (uint256) {
        uint256 bal = copm.balanceOf(address(this));
        return bal > pendingInterest ? bal - pendingInterest : 0;
    }

    // ════════════════════════════ Fondeo ═════════════════════════════

    /// @notice Carga COPm al pool. Requiere approve(pool, amount) previo.
    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        totalFunded += amount;
        emit Funded(msg.sender, amount);
        copm.safeTransferFrom(msg.sender, address(this), amount);
    }

    // ══════════════════════════ Desembolso ═══════════════════════════

    struct DisbursementRequest {
        bytes32 creditId;
        address borrower;
        uint256 principal;
        uint256 interest;
        uint64  dueDate;
    }

    /// @notice Desembolsa un crédito. Solo `disburser`. El interés se fija aquí.
    /// @param  interest Interés total del crédito (puede ser 0). totalDue = principal + interest.
    /// @param  dueDate  Vencimiento opcional (0 si el cronograma vive off-chain).
    function disburse(
        bytes32 creditId,
        address borrower,
        uint256 principal,
        uint256 interest,
        uint64 dueDate
    ) external onlyDisburser whenNotPaused nonReentrant {
        _disburse(creditId, borrower, principal, interest, dueDate);
    }

    /// @notice Desembolsa varios créditos en una sola tx (automatización en lote).
    /// @dev    Atómico: si uno falla, revierte todo. Trocea el arreglo off-chain
    ///         (≈20–50 por tx) para no exceder el gas de bloque.
    function disburseBatch(DisbursementRequest[] calldata reqs)
        external
        onlyDisburser
        whenNotPaused
        nonReentrant
    {
        uint256 len = reqs.length;
        for (uint256 i = 0; i < len; ++i) {
            _disburse(reqs[i].creditId, reqs[i].borrower, reqs[i].principal, reqs[i].interest, reqs[i].dueDate);
        }
    }

    function _disburse(
        bytes32 creditId,
        address borrower,
        uint256 principal,
        uint256 interest,
        uint64 dueDate
    ) internal {
        if (borrower == address(0)) revert ZeroAddress();
        if (principal == 0) revert ZeroAmount();
        if (principal > maxDisbursement) revert AmountExceedsCap();
        if (credits[creditId].status != Status.NONE) revert CreditAlreadyExists();

        uint256 due = principal + interest; // 0.8.x revierte ante overflow
        if (due > type(uint128).max) revert InvalidLoanTerms();
        if (availableLiquidity() < principal) revert InsufficientLiquidity();

        // checks-effects-interactions: estado antes de la transferencia
        credits[creditId] = Credit({
            principal:   uint128(principal),
            totalDue:    uint128(due),
            totalRepaid: 0,
            disbursedAt: uint64(block.timestamp),
            dueDate:     dueDate,
            borrower:    borrower,
            status:      Status.ACTIVE
        });

        totalDisbursed += principal;
        unchecked {
            ++creditCount;
            ++activeCredits;
        }

        emit Disbursed(creditId, borrower, principal, due, dueDate);
        copm.safeTransfer(borrower, principal);
    }

    // ════════════════════════════ Repago ═════════════════════════════

    /// @notice Repaga un crédito (capital + interés). Requiere approve(pool, amount) previo.
    /// @dev    Tope automático en el saldo: jamás se sobre-paga. La imputación es
    ///         capital-primero; el excedente sobre el capital es interés y se acumula en
    ///         `pendingInterest` para barrerse al treasury. Vale para créditos ACTIVE y
    ///         DEFAULTED (recuperaciones). Devuelve el monto efectivamente aceptado.
    function repay(bytes32 creditId, uint256 amount)
        external
        nonReentrant
        returns (uint256 accepted)
    {
        if (amount == 0) revert ZeroAmount();
        Credit storage c = credits[creditId];
        Status s = c.status;
        if (s == Status.NONE) revert CreditNotFound();

        uint256 due = c.totalDue;
        uint256 repaid = c.totalRepaid;
        uint256 remaining = due - repaid;
        if (remaining == 0) revert CreditAlreadyRepaid();

        accepted = amount > remaining ? remaining : amount;
        uint256 newRepaid = repaid + accepted;

        // Imputación capital-primero. principalPart + interestPart == accepted (siempre).
        uint256 principal = c.principal;
        uint256 prevPrincipalPaid = repaid < principal ? repaid : principal;
        uint256 newPrincipalPaid  = newRepaid < principal ? newRepaid : principal;
        uint256 principalPart = newPrincipalPaid - prevPrincipalPaid;
        uint256 interestPart  = accepted - principalPart;

        c.totalRepaid = uint128(newRepaid);
        if (principalPart != 0) {
            totalPrincipalRepaid += principalPart;
        }
        if (interestPart != 0) {
            pendingInterest += interestPart;
            totalInterestCollected += interestPart;
        }

        if (newRepaid == due) {
            c.status = Status.REPAID;
            if (s == Status.ACTIVE) {
                activeCredits -= 1;
            }
            emit CreditFullyRepaid(creditId);
        }

        emit Repaid(creditId, msg.sender, accepted, principalPart, interestPart, newRepaid);
        copm.safeTransferFrom(msg.sender, address(this), accepted);
    }

    // ════════════════════ Barrido de intereses ═══════════════════════

    /// @notice "Barre" todo el interés acumulado hacia `treasury` (la fundación).
    /// @dev    Permissionless a propósito: el destino es FIJO (solo el owner lo cambia),
    ///         así que un cron/bot puede llamarlo en piloto automático sin riesgo de fuga.
    function sweepInterest() external nonReentrant returns (uint256 amount) {
        amount = pendingInterest;
        if (amount == 0) revert NothingToSweep();
        pendingInterest = 0;
        totalInterestSwept += amount;
        emit InterestSwept(treasury, amount);
        copm.safeTransfer(treasury, amount);
    }

    // ════════════════════════════ Mora ═══════════════════════════════

    /// @notice Marca un crédito en mora (contable). NO mueve fondos y NO bloquea
    ///         repagos: el crédito sigue aceptando recuperaciones y puede pasar a REPAID.
    function markDefaulted(bytes32 creditId) external onlyDisburserOrOwner {
        Credit storage c = credits[creditId];
        if (c.status != Status.ACTIVE) revert CreditNotActive();

        c.status = Status.DEFAULTED;
        activeCredits -= 1;

        uint256 principal = c.principal;
        uint256 paidPrincipal = c.totalRepaid < principal ? c.totalRepaid : principal;
        uint256 outstandingPrincipal = principal - paidPrincipal;

        emit CreditDefaulted(creditId, outstandingPrincipal);
    }

    // ════════════════════════ Administración ═════════════════════════

    function setDisburser(address _disburser) external onlyOwner {
        if (_disburser == address(0)) revert ZeroAddress();
        emit DisburserChanged(disburser, _disburser);
        disburser = _disburser;
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        emit TreasuryChanged(treasury, _treasury);
        treasury = _treasury;
    }

    function setMaxDisbursement(uint256 _max) external onlyOwner {
        emit MaxDisbursementChanged(maxDisbursement, _max);
        maxDisbursement = _max;
    }

    /// @notice Pausa nuevos desembolsos (corta la salida de capital). Fondeo, repagos y
    ///         barrido siguen operando: el fondo puede recibir dinero aunque esté pausado.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Retiro de emergencia (solo owner/multisig). Puede tocar capital E interés;
    ///         úsese únicamente en incidentes. Emite evento para auditoría.
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        emit EmergencyWithdrawn(to, amount);
        copm.safeTransfer(to, amount);
    }

    // ════════════════════════════ Vistas ═════════════════════════════

    function getCredit(bytes32 creditId) external view returns (Credit memory) {
        return credits[creditId];
    }

    /// @notice Saldo pendiente de un crédito (capital + interés por repagar).
    function remainingDue(bytes32 creditId) external view returns (uint256) {
        Credit storage c = credits[creditId];
        return c.totalDue - c.totalRepaid;
    }

    /// @notice Interés total pactado de un crédito (totalDue - principal).
    function interestOf(bytes32 creditId) external view returns (uint256) {
        Credit storage c = credits[creditId];
        return c.totalDue - c.principal;
    }

    /// @notice Capital vivo global (desembolsado − recuperado). No descuenta castigos.
    function outstandingPrincipalGlobal() external view returns (uint256) {
        return totalDisbursed > totalPrincipalRepaid ? totalDisbursed - totalPrincipalRepaid : 0;
    }
}
