// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";
import {LiquidityPoolFactory} from "../src/LiquidityPoolFactory.sol";
import {FeeManager} from "../src/FeeManager.sol";
import {EIP712Swap} from "../src/EIP712Swap.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {Roles} from "../src/Roles.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract LiquidityPoolTest is Test {
    LiquidityPool public pool;
    LiquidityPoolFactory public factory;
    FeeManager public feeManager;
    FeeManager public feeManagerImpl;
    EIP712Swap public eip712Swap;
    MockERC20 public token0;
    MockERC20 public token1;
    address public admin;
    address public user1;
    address public user2;

    uint256 private constant INITIAL_FEE = 250; // 2.5%
    uint256 private constant TOKEN0_DECIMALS = 18;
    uint256 private constant TOKEN1_DECIMALS = 18;

    function setUp() public {
        admin = address(this);
        user1 = address(0x1);
        user2 = address(0x2);

        // Deploy tokens
        token0 = new MockERC20("Token0", "T0", uint8(TOKEN0_DECIMALS));
        token1 = new MockERC20("Token1", "T1", uint8(TOKEN1_DECIMALS));

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

        // Deploy Factory (which deploys master implementation)
        factory = new LiquidityPoolFactory(
            address(feeManager),
            address(eip712Swap)
        );

        // Create pool using factory
        address poolAddress = factory.createPool(
            address(token0),
            TOKEN0_DECIMALS,
            address(token1),
            TOKEN1_DECIMALS,
            admin
        );
        pool = LiquidityPool(poolAddress);
    }

    function test_FactoryDeployment() public {
        assertTrue(address(factory.masterImplementation()) != address(0));
        assertEq(address(factory.feeManager()), address(feeManager));
        assertEq(address(factory.eip712Swap()), address(eip712Swap));
    }

    function test_Initialize() public {
        assertEq(pool.token0(), address(token0));
        assertEq(pool.token1(), address(token1));
        assertEq(pool.token0Decimals(), TOKEN0_DECIMALS);
        assertEq(pool.token1Decimals(), TOKEN1_DECIMALS);
        assertEq(address(pool.feeManager()), address(feeManager));
        assertEq(address(pool.eip712Swap()), address(eip712Swap));
    }

    function test_FactoryGetPool() public {
        address poolAddr = factory.getPool(address(token0), address(token1));
        assertEq(poolAddr, address(pool));

        // Test reverse lookup
        address poolAddrReverse = factory.getPool(
            address(token1),
            address(token0)
        );
        assertEq(poolAddrReverse, address(pool));
    }

    function test_FactoryAllPoolsLength() public {
        assertEq(factory.allPoolsLength(), 1);

        // Create another pool
        MockERC20 token2 = new MockERC20("Token2", "T2", 18);
        factory.createPool(
            address(token0),
            TOKEN0_DECIMALS,
            address(token2),
            TOKEN1_DECIMALS,
            admin
        );
        assertEq(factory.allPoolsLength(), 2);
    }

    function test_RevertWhen_ReinitializePool() public {
        vm.expectRevert(LiquidityPool.AlreadyInitialized.selector);
        pool.initialize(
            address(token0),
            TOKEN0_DECIMALS,
            address(token1),
            TOKEN1_DECIMALS,
            address(feeManager),
            address(eip712Swap),
            admin
        );
    }

    function test_RevertWhen_DuplicatePool() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                LiquidityPoolFactory.PoolAlreadyExists.selector,
                address(token0) < address(token1)
                    ? address(token0)
                    : address(token1),
                address(token0) < address(token1)
                    ? address(token1)
                    : address(token0)
            )
        );
        factory.createPool(
            address(token0),
            TOKEN0_DECIMALS,
            address(token1),
            TOKEN1_DECIMALS,
            admin
        );
    }

    function test_RevertWhen_IdenticalTokens() public {
        vm.expectRevert(LiquidityPoolFactory.IdenticalTokens.selector);
        factory.createPool(
            address(token0),
            TOKEN0_DECIMALS,
            address(token0),
            TOKEN1_DECIMALS,
            admin
        );
    }

    function test_AddLiquidityToken0() public {
        token0.mint(admin, 10000e18);
        token0.approve(address(pool), 10000e18);

        pool.addLiquidity(address(token0), 5000e18);
        (uint256 reserve0, uint256 reserve1) = pool.getReserves();
        assertEq(reserve0, 5000e18);
        assertEq(reserve1, 0);
    }

    function test_AddLiquidityToken1() public {
        token1.mint(admin, 10000e18);
        token1.approve(address(pool), 10000e18);

        pool.addLiquidity(address(token1), 5000e18);
        (uint256 reserve0, uint256 reserve1) = pool.getReserves();
        assertEq(reserve0, 0);
        assertEq(reserve1, 5000e18);
    }

    function test_RevertWhen_NonAdminAddsLiquidity() public {
        token0.mint(user1, 10000e18);
        vm.prank(user1);
        token0.approve(address(pool), 10000e18);

        vm.prank(user1);
        vm.expectRevert();
        pool.addLiquidity(address(token0), 5000e18);
    }

    function test_RevertWhen_InvalidTokenAddress() public {
        MockERC20 invalidToken = new MockERC20("Invalid", "INV", 18);
        token0.mint(admin, 10000e18);
        token0.approve(address(pool), 10000e18);

        vm.expectRevert(
            abi.encodeWithSelector(
                LiquidityPool.InvalidTokenAddress.selector,
                address(invalidToken)
            )
        );
        pool.addLiquidity(address(invalidToken), 5000e18);
    }

    function test_RevertWhen_InsufficientTokenBalance() public {
        token0.mint(admin, 1000e18);
        token0.approve(address(pool), 5000e18);

        vm.expectRevert(LiquidityPool.InsufficientTokenBalance.selector);
        pool.addLiquidity(address(token0), 5000e18);
    }

    function test_RemoveLiquidity() public {
        token0.mint(admin, 10000e18);
        token0.approve(address(pool), 10000e18);
        pool.addLiquidity(address(token0), 5000e18);

        uint256 balanceBefore = token0.balanceOf(admin);
        pool.removeLiquidity(address(token0), 2000e18);
        uint256 balanceAfter = token0.balanceOf(admin);

        assertEq(balanceAfter - balanceBefore, 2000e18);
        (uint256 reserve0, uint256 reserve1) = pool.getReserves();
        assertEq(reserve0, 3000e18);
    }

    function test_RevertWhen_RemoveMoreThanReserve() public {
        token0.mint(admin, 10000e18);
        token0.approve(address(pool), 10000e18);
        pool.addLiquidity(address(token0), 5000e18);

        vm.expectRevert();
        pool.removeLiquidity(address(token0), 6000e18);
    }

    function test_GetPrice() public {
        token0.mint(admin, 10000e18);
        token1.mint(admin, 20000e18);
        token0.approve(address(pool), 10000e18);
        token1.approve(address(pool), 20000e18);
        pool.addLiquidity(address(token0), 10000e18);
        pool.addLiquidity(address(token1), 20000e18);

        uint256 price = pool.getPrice(address(token0), address(token1));
        assertEq(price, 2e18); // 20000/10000 = 2
    }

    function test_GetPriceWithZeroReserves() public {
        uint256 price = pool.getPrice(address(token0), address(token1));
        assertEq(price, 0);
    }

    function test_Swap() public {
        // Setup liquidity
        token0.mint(admin, 100000e18);
        token1.mint(admin, 200000e18);
        token0.approve(address(pool), type(uint256).max);
        token1.approve(address(pool), type(uint256).max);
        pool.addLiquidity(address(token0), 100000e18);
        pool.addLiquidity(address(token1), 200000e18);

        // Setup user
        token0.mint(user1, 10000e18);
        vm.prank(user1);
        token0.approve(address(pool), type(uint256).max);

        uint256 token1BalanceBefore = token1.balanceOf(user1);
        vm.prank(admin);
        pool.swap(user1, address(token0), address(token1), 1000e18, 0);
        uint256 token1BalanceAfter = token1.balanceOf(user1);

        assertGt(token1BalanceAfter, token1BalanceBefore);
        (uint256 reserve0, uint256 reserve1) = pool.getReserves();
        assertEq(reserve0, 101000e18);
        assertLt(reserve1, 200000e18);
    }

    function test_RevertWhen_InvalidTokenPair() public {
        MockERC20 invalidToken = new MockERC20("Invalid", "INV", 18);
        token0.mint(user1, 10000e18);
        vm.prank(user1);
        token0.approve(address(pool), type(uint256).max);

        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                LiquidityPool.InvalidTokenPair.selector,
                address(invalidToken),
                address(token1)
            )
        );
        pool.swap(user1, address(invalidToken), address(token1), 1000e18, 0);
    }

    function test_RevertWhen_SameTokenInAndOut() public {
        token0.mint(user1, 10000e18);
        vm.prank(user1);
        token0.approve(address(pool), type(uint256).max);

        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                LiquidityPool.InvalidTokenPair.selector,
                address(token0),
                address(token0)
            )
        );
        pool.swap(user1, address(token0), address(token0), 1000e18, 0);
    }

    function test_RevertWhen_InsufficientLiquidity() public {
        token0.mint(user1, 10000e18);
        vm.prank(user1);
        token0.approve(address(pool), type(uint256).max);

        vm.prank(admin);
        vm.expectRevert(LiquidityPool.InsufficientLiquidity.selector);
        pool.swap(user1, address(token0), address(token1), 1000e18, 0);
    }

    function test_RevertWhen_InsufficientOutputAmount() public {
        // Setup liquidity
        token0.mint(admin, 100000e18);
        token1.mint(admin, 200000e18);
        token0.approve(address(pool), type(uint256).max);
        token1.approve(address(pool), type(uint256).max);
        pool.addLiquidity(address(token0), 100000e18);
        pool.addLiquidity(address(token1), 200000e18);

        token0.mint(user1, 10000e18);
        vm.prank(user1);
        token0.approve(address(pool), type(uint256).max);

        vm.prank(admin);
        vm.expectRevert();
        pool.swap(user1, address(token0), address(token1), 1000e18, 1000000e18);
    }

    function test_RevertWhen_InsufficientAllowance() public {
        // Setup liquidity
        token0.mint(admin, 100000e18);
        token1.mint(admin, 200000e18);
        token0.approve(address(pool), type(uint256).max);
        token1.approve(address(pool), type(uint256).max);
        pool.addLiquidity(address(token0), 100000e18);
        pool.addLiquidity(address(token1), 200000e18);

        token0.mint(user1, 10000e18);
        // Don't approve

        vm.prank(admin);
        vm.expectRevert(LiquidityPool.InsufficientAllowance.selector);
        pool.swap(user1, address(token0), address(token1), 1000e18, 0);
    }

    function test_GrantSwapRole() public {
        pool.grantSwapRole(user1);
        assertTrue(pool.hasRole(Roles.ALLOWED_EIP712_SWAP_ROLE, user1));
    }

    function test_RevokeSwapRole() public {
        pool.grantSwapRole(user1);
        pool.revokeSwapRole(user1);
        assertFalse(pool.hasRole(Roles.ALLOWED_EIP712_SWAP_ROLE, user1));
    }
}
