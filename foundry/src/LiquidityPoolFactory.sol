// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./LiquidityPool.sol";

/// @title LiquidityPoolFactory
/// @notice Factory contract for creating liquidity pools using EIP-1167 minimal proxies
/// @dev This factory uses the Clones library to deploy cheap pool instances
contract LiquidityPoolFactory {
    using Clones for address;

    /// @notice The master implementation contract (never initialized)
    LiquidityPool public immutable masterImplementation;

    /// @notice FeeManager used by all pools
    address public immutable feeManager;

    /// @notice EIP712Swap used by all pools
    address public immutable eip712Swap;

    /// @notice Mapping from token0 => token1 => pool address
    /// @dev token0 < token1 for consistent ordering
    mapping(address => mapping(address => address)) public getPool;

    /// @notice Array of all pool addresses
    address[] public allPools;

    event PoolCreated(
        address indexed token0,
        address indexed token1,
        address pool,
        uint256 poolCount
    );

    error PoolAlreadyExists(address token0, address token1);
    error IdenticalTokens();
    error ZeroAddress();

    /// @notice Deploy the factory and master implementation
    /// @param _feeManager FeeManager contract address
    /// @param _eip712Swap EIP712Swap contract address
    constructor(address _feeManager, address _eip712Swap) {
        if (_feeManager == address(0) || _eip712Swap == address(0)) {
            revert ZeroAddress();
        }

        // Deploy master implementation (expensive, but only once)
        // This contract is never initialized and serves as the implementation
        masterImplementation = new LiquidityPool();
        feeManager = _feeManager;
        eip712Swap = _eip712Swap;
    }

    /// @notice Get the number of pools created
    /// @return The number of pools
    function allPoolsLength() external view returns (uint256) {
        return allPools.length;
    }

    /// @notice Create a new liquidity pool for a token pair
    /// @param token0 First token address
    /// @param token0Decimals Decimals for token0
    /// @param token1 Second token address
    /// @param token1Decimals Decimals for token1
    /// @param admin Admin address for the pool
    /// @return pool Address of the newly created pool
    function createPool(
        address token0,
        uint256 token0Decimals,
        address token1,
        uint256 token1Decimals,
        address admin
    ) external returns (address pool) {
        if (token0 == token1) revert IdenticalTokens();
        if (token0 == address(0) || token1 == address(0)) revert ZeroAddress();

        // Ensure token0 < token1 for consistent ordering
        (address tokenA, address tokenB) = token0 < token1
            ? (token0, token1)
            : (token1, token0);

        if (getPool[tokenA][tokenB] != address(0)) {
            revert PoolAlreadyExists(tokenA, tokenB);
        }

        // Create clone (cheap! ~45K gas vs ~2M gas for full deployment)
        pool = address(masterImplementation).clone();

        // Initialize the clone
        LiquidityPool(pool).initialize(
            token0,
            token0Decimals,
            token1,
            token1Decimals,
            feeManager,
            eip712Swap,
            admin
        );

        // Store pool address (both directions for easy lookup)
        getPool[tokenA][tokenB] = pool;
        getPool[tokenB][tokenA] = pool;
        allPools.push(pool);

        emit PoolCreated(token0, token1, pool, allPools.length);
    }

    /// @notice Create pool with deterministic address (using create2)
    /// @param token0 First token address
    /// @param token0Decimals Decimals for token0
    /// @param token1 Second token address
    /// @param token1Decimals Decimals for token1
    /// @param admin Admin address for the pool
    /// @param salt Salt for deterministic deployment
    /// @return pool Address of the newly created pool
    function createPoolDeterministic(
        address token0,
        uint256 token0Decimals,
        address token1,
        uint256 token1Decimals,
        address admin,
        bytes32 salt
    ) external returns (address pool) {
        if (token0 == token1) revert IdenticalTokens();
        if (token0 == address(0) || token1 == address(0)) revert ZeroAddress();

        (address tokenA, address tokenB) = token0 < token1
            ? (token0, token1)
            : (token1, token0);

        if (getPool[tokenA][tokenB] != address(0)) {
            revert PoolAlreadyExists(tokenA, tokenB);
        }

        // Create deterministic clone
        pool = address(masterImplementation).cloneDeterministic(salt);

        LiquidityPool(pool).initialize(
            token0,
            token0Decimals,
            token1,
            token1Decimals,
            feeManager,
            eip712Swap,
            admin
        );

        getPool[tokenA][tokenB] = pool;
        getPool[tokenB][tokenA] = pool;
        allPools.push(pool);

        emit PoolCreated(token0, token1, pool, allPools.length);
    }

    /// @notice Predict the address of a deterministic pool
    /// @param salt Salt for deterministic deployment
    /// @return predicted The predicted address
    function predictPoolAddress(
        bytes32 salt
    ) external view returns (address predicted) {
        return address(masterImplementation).predictDeterministicAddress(salt);
    }
}
