// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {LiquidityPoolFactory} from "../src/LiquidityPoolFactory.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";
import {FeeManager} from "../src/FeeManager.sol";
import {EIP712Swap} from "../src/EIP712Swap.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract LiquidityPoolFactoryTest is Test {
    LiquidityPoolFactory public factory;
    FeeManager public feeManager;
    FeeManager public feeManagerImpl;
    EIP712Swap public eip712Swap;
    MockERC20 public token0;
    MockERC20 public token1;
    MockERC20 public token2;
    address public admin;

    uint256 private constant INITIAL_FEE = 250;

    function setUp() public {
        admin = address(this);

        // Deploy tokens
        token0 = new MockERC20("Token0", "T0", 18);
        token1 = new MockERC20("Token1", "T1", 18);
        token2 = new MockERC20("Token2", "T2", 18);

        // Deploy FeeManager
        feeManagerImpl = new FeeManager();
        bytes memory initData = abi.encodeWithSelector(
            FeeManager.initialize.selector,
            INITIAL_FEE
        );
        ERC1967Proxy feeManagerProxy = new ERC1967Proxy(
            address(feeManagerImpl),
            initData
        );
        feeManager = FeeManager(address(feeManagerProxy));

        // Deploy EIP712Swap
        eip712Swap = new EIP712Swap();

        // Deploy Factory
        factory = new LiquidityPoolFactory(
            address(feeManager),
            address(eip712Swap)
        );
    }

    function test_FactoryConstructor() public {
        assertTrue(address(factory.masterImplementation()) != address(0));
        assertEq(address(factory.feeManager()), address(feeManager));
        assertEq(address(factory.eip712Swap()), address(eip712Swap));
        assertEq(factory.allPoolsLength(), 0);
    }

    function test_CreatePool() public {
        address poolAddress = factory.createPool(
            address(token0),
            18,
            address(token1),
            18,
            admin
        );

        assertTrue(poolAddress != address(0));
        assertEq(
            factory.getPool(address(token0), address(token1)),
            poolAddress
        );
        assertEq(
            factory.getPool(address(token1), address(token0)),
            poolAddress
        );
        assertEq(factory.allPoolsLength(), 1);

        // Verify pool is initialized correctly
        LiquidityPool pool = LiquidityPool(poolAddress);
        assertEq(pool.token0(), address(token0));
        assertEq(pool.token1(), address(token1));
        assertEq(address(pool.feeManager()), address(feeManager));
        assertEq(address(pool.eip712Swap()), address(eip712Swap));
    }

    function test_CreateMultiplePools() public {
        address pool1 = factory.createPool(
            address(token0),
            18,
            address(token1),
            18,
            admin
        );
        address pool2 = factory.createPool(
            address(token0),
            18,
            address(token2),
            18,
            admin
        );
        address pool3 = factory.createPool(
            address(token1),
            18,
            address(token2),
            18,
            admin
        );

        assertEq(factory.allPoolsLength(), 3);
        assertEq(factory.getPool(address(token0), address(token1)), pool1);
        assertEq(factory.getPool(address(token0), address(token2)), pool2);
        assertEq(factory.getPool(address(token1), address(token2)), pool3);
    }

    function test_CreatePoolDeterministic() public {
        bytes32 salt = keccak256("test-salt");
        address predicted = factory.predictPoolAddress(salt);

        address poolAddress = factory.createPoolDeterministic(
            address(token0),
            18,
            address(token1),
            18,
            admin,
            salt
        );

        assertEq(poolAddress, predicted);
        assertEq(
            factory.getPool(address(token0), address(token1)),
            poolAddress
        );
    }

    function test_PredictPoolAddress() public {
        bytes32 salt = keccak256("deterministic-test");
        address predicted = factory.predictPoolAddress(salt);

        assertTrue(predicted != address(0));

        address actual = factory.createPoolDeterministic(
            address(token0),
            18,
            address(token1),
            18,
            admin,
            salt
        );

        assertEq(actual, predicted);
    }

    function test_RevertWhen_DuplicatePool() public {
        factory.createPool(address(token0), 18, address(token1), 18, admin);

        // Factory normalizes token order (tokenA < tokenB)
        address tokenA = address(token0) < address(token1)
            ? address(token0)
            : address(token1);
        address tokenB = address(token0) < address(token1)
            ? address(token1)
            : address(token0);

        vm.expectRevert(
            abi.encodeWithSelector(
                LiquidityPoolFactory.PoolAlreadyExists.selector,
                tokenA,
                tokenB
            )
        );
        factory.createPool(address(token0), 18, address(token1), 18, admin);
    }

    function test_RevertWhen_IdenticalTokens() public {
        vm.expectRevert(LiquidityPoolFactory.IdenticalTokens.selector);
        factory.createPool(address(token0), 18, address(token0), 18, admin);
    }

    function test_RevertWhen_ZeroAddressToken() public {
        vm.expectRevert(LiquidityPoolFactory.ZeroAddress.selector);
        factory.createPool(address(0), 18, address(token1), 18, admin);
    }

    function test_PoolIsClone() public {
        address poolAddress = factory.createPool(
            address(token0),
            18,
            address(token1),
            18,
            admin
        );

        // Clones have minimal bytecode (~55 bytes)
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(poolAddress)
        }
        assertLt(codeSize, 100); // Clone should have minimal code
    }

    function test_EachPoolHasOwnStorage() public {
        address pool1 = factory.createPool(
            address(token0),
            18,
            address(token1),
            18,
            admin
        );
        address pool2 = factory.createPool(
            address(token0),
            18,
            address(token2),
            18,
            admin
        );

        LiquidityPool p1 = LiquidityPool(pool1);
        LiquidityPool p2 = LiquidityPool(pool2);

        // Add liquidity to pool1
        token0.mint(admin, 10000e18);
        token0.approve(pool1, 10000e18);
        p1.addLiquidity(address(token0), 5000e18);

        // Pool2 should have no reserves
        (uint256 reserve0_1, uint256 reserve1_1) = p1.getReserves();
        (uint256 reserve0_2, uint256 reserve1_2) = p2.getReserves();

        assertEq(reserve0_1, 5000e18);
        assertEq(reserve0_2, 0);
        assertEq(reserve1_1, 0);
        assertEq(reserve1_2, 0);
    }
}
