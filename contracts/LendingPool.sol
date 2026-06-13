// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LendingPool
 * @notice Escrow de COPm para Mangle. Los fondos viven en el contrato:
 *         - disburse(): solo el rol `disburser`, con cap por tx, registra el crédito.
 *         - repay():    cualquiera (approve + transferFrom), contabiliza por creditId.
 *         - fund():     carga COPm al pool (approve + transferFrom).
 *         Owner (idealmente multisig) administra rol/cap y retiros de emergencia.
 */
contract LendingPool is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable copm;

    address public disburser;
    uint256 public maxDisbursement;

    struct Credit {
        uint256 amount;
        address borrower;
        uint256 totalRepaid;
        bool exists;
        bool fullyRepaid;
    }

    mapping(bytes32 => Credit) public credits;

    event Funded(address indexed from, uint256 amount);
    event Disbursed(bytes32 indexed creditId, address indexed borrower, uint256 amount);
    event Repaid(bytes32 indexed creditId, address indexed payer, uint256 amount, uint256 totalRepaid);
    event DisburserChanged(address indexed previous, address indexed current);
    event MaxDisbursementChanged(uint256 previous, uint256 current);

    error NotDisburser();
    error CreditAlreadyExists();
    error CreditNotFound();
    error ZeroAmount();
    error ZeroAddress();
    error AmountExceedsCap();
    error InsufficientPoolBalance();
    error AlreadyFullyRepaid();

    modifier onlyDisburser() {
        if (msg.sender != disburser) revert NotDisburser();
        _;
    }

    constructor(
        address _copm,
        address _owner,
        address _disburser,
        uint256 _maxDisbursement
    ) Ownable(_owner) {
        if (_copm == address(0) || _disburser == address(0)) revert ZeroAddress();
        copm = IERC20(_copm);
        disburser = _disburser;
        maxDisbursement = _maxDisbursement;
    }

    /// @notice Carga COPm al pool. Requiere approve(pool, amount) previo.
    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        copm.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    /// @notice Desembolsa un crédito. Solo disburser. Registra el crédito on-chain.
    function disburse(bytes32 creditId, address borrower, uint256 amount)
        external
        onlyDisburser
        nonReentrant
    {
        if (borrower == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > maxDisbursement) revert AmountExceedsCap();
        if (credits[creditId].exists) revert CreditAlreadyExists();
        if (copm.balanceOf(address(this)) < amount) revert InsufficientPoolBalance();

        // checks-effects-interactions: estado antes de la transferencia
        credits[creditId] = Credit({
            amount: amount,
            borrower: borrower,
            totalRepaid: 0,
            exists: true,
            fullyRepaid: false
        });

        emit Disbursed(creditId, borrower, amount);
        copm.safeTransfer(borrower, amount);
    }

    /// @notice Repaga un crédito. Requiere approve(pool, amount) previo.
    function repay(bytes32 creditId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Credit storage c = credits[creditId];
        if (!c.exists) revert CreditNotFound();
        if (c.fullyRepaid) revert AlreadyFullyRepaid();

        c.totalRepaid += amount;
        if (c.totalRepaid >= c.amount) {
            c.fullyRepaid = true;
        }

        emit Repaid(creditId, msg.sender, amount, c.totalRepaid);
        copm.safeTransferFrom(msg.sender, address(this), amount);
    }

    function setDisburser(address _disburser) external onlyOwner {
        if (_disburser == address(0)) revert ZeroAddress();
        emit DisburserChanged(disburser, _disburser);
        disburser = _disburser;
    }

    function setMaxDisbursement(uint256 _max) external onlyOwner {
        emit MaxDisbursementChanged(maxDisbursement, _max);
        maxDisbursement = _max;
    }

    /// @notice Retiro de emergencia (solo owner/multisig).
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        copm.safeTransfer(to, amount);
    }
}
