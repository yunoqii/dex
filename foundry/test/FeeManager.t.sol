// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {FeeManager} from "../src/FeeManager.sol";
import {ISwap} from "../src/ISwap.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract FeeManagerTest is Test {
    FeeManager public feeManager;
    FeeManager public implementation;
    address public admin;
    address public user1;
    uint256 public constant INITIAL_FEE = 250; // 2.5%

    function setUp() public {
        admin = address(this);
        user1 = address(0x1);

        implementation = new FeeManager();
        bytes memory initData = abi.encodeWithSelector(
            FeeManager.initialize.selector,
            INITIAL_FEE
        );
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            initData
        );
        feeManager = FeeManager(address(proxy));
    }

    function test_Initialize() public {
        assertEq(feeManager.fee(), INITIAL_FEE);
        assertTrue(feeManager.hasRole(feeManager.DEFAULT_ADMIN_ROLE(), admin));
    }

    function test_SetFee() public {
        uint256 newFee = 500; // 5%
        feeManager.setFee(newFee);
        assertEq(feeManager.fee(), newFee);
    }

    function test_RevertWhen_NonAdminSetsFee() public {
        vm.prank(user1);
        vm.expectRevert();
        feeManager.setFee(300);
    }

    function test_GetFee() public {
        ISwap.SwapParams memory swapParams = ISwap.SwapParams({
            token0: address(0x1),
            token1: address(0x2),
            amount0: 1000e18,
            reserveToken0: 10000e18,
            reserveToken1: 20000e18
        });

        uint256 amountOut = (swapParams.amount0 * swapParams.reserveToken1) /
            (swapParams.reserveToken0 + swapParams.amount0);
        uint256 expectedFee = (amountOut * INITIAL_FEE) /
            feeManager.FEE_DENOMINATOR();

        uint256 fee = feeManager.getFee(swapParams);
        assertEq(fee, expectedFee);
    }

    function test_GetFeeWithZeroReserves() public {
        ISwap.SwapParams memory swapParams = ISwap.SwapParams({
            token0: address(0x1),
            token1: address(0x2),
            amount0: 1000e18,
            reserveToken0: 0,
            reserveToken1: 0
        });

        // Should handle division by zero gracefully
        uint256 fee = feeManager.getFee(swapParams);
        // Fee should be 0 when reserves are 0
        assertEq(fee, 0);
    }

    function test_Upgrade() public {
        FeeManager newImplementation = new FeeManager();
        // Upgrade without re-initializing (contract is already initialized)
        // Just upgrade the implementation, don't call initialize again
        feeManager.upgradeToAndCall(address(newImplementation), "");
        // Verify upgrade succeeded - check that fee is still the same
        assertEq(feeManager.fee(), INITIAL_FEE);
    }

    function test_RevertWhen_NonAdminUpgrades() public {
        FeeManager newImplementation = new FeeManager();
        vm.prank(user1);
        vm.expectRevert();
        feeManager.upgradeToAndCall(
            address(newImplementation),
            abi.encodeWithSelector(FeeManager.initialize.selector, 300)
        );
    }
}
