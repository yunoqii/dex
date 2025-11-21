// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {EIP712Swap} from "../src/EIP712Swap.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";
import {LiquidityPoolFactory} from "../src/LiquidityPoolFactory.sol";
import {FeeManager} from "../src/FeeManager.sol";
import {ISwap} from "../src/ISwap.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {Roles} from "../src/Roles.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract EIP712SwapTest is Test {
    EIP712Swap public eip712Swap;
    LiquidityPool public pool;
    LiquidityPoolFactory public factory;
    FeeManager public feeManager;
    FeeManager public feeManagerImpl;
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
        user1 = vm.addr(1); // Address corresponding to private key 1
        user2 = vm.addr(2); // Address corresponding to private key 2

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

        // Deploy Factory
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

        // Note: EIP712Swap role is automatically granted during initialization

        // Setup liquidity
        token0.mint(admin, 1000000e18);
        token1.mint(admin, 1000000e18);
        token0.approve(address(pool), type(uint256).max);
        token1.approve(address(pool), type(uint256).max);
        pool.addLiquidity(address(token0), 100000e18);
        pool.addLiquidity(address(token1), 200000e18);
    }

    function test_GetDomainSeparator() public {
        bytes32 domainSeparator = eip712Swap.getDomainSeparator();
        assertTrue(domainSeparator != bytes32(0));
    }

    function test_GetNonce() public {
        assertEq(eip712Swap.getNonce(user1), 0);
    }

    /// @notice Helper function to sign a swap request
    function _signSwapRequest(
        ISwap.SwapRequest memory swapRequest,
        uint256 privateKey
    ) internal view returns (bytes memory) {
        bytes32 typeHash = keccak256(
            "SwapRequest(address pool,address sender,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,uint256 nonce,uint256 deadline)"
        );
        bytes32 structHash = keccak256(
            abi.encode(
                typeHash,
                swapRequest.pool,
                swapRequest.sender,
                swapRequest.tokenIn,
                swapRequest.tokenOut,
                swapRequest.amountIn,
                swapRequest.minAmountOut,
                swapRequest.nonce,
                swapRequest.deadline
            )
        );

        bytes32 domainSeparator = eip712Swap.getDomainSeparator();
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, structHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_VerifyValidSignature() public {
        uint256 nonce = eip712Swap.getNonce(user1);
        uint256 deadline = block.timestamp + 1 hours;

        ISwap.SwapRequest memory swapRequest = ISwap.SwapRequest({
            pool: address(pool),
            sender: user1,
            tokenIn: address(token0),
            tokenOut: address(token1),
            amountIn: 1000e18,
            minAmountOut: 0,
            nonce: nonce,
            deadline: deadline
        });

        bytes memory signature = _signSwapRequest(swapRequest, 1);

        bool isValid = eip712Swap.verify(swapRequest, signature);
        assertTrue(isValid);
    }

    function test_VerifyInvalidSignature() public {
        uint256 nonce = eip712Swap.getNonce(user1);
        uint256 deadline = block.timestamp + 1 hours;

        ISwap.SwapRequest memory swapRequest = ISwap.SwapRequest({
            pool: address(pool),
            sender: user1,
            tokenIn: address(token0),
            tokenOut: address(token1),
            amountIn: 1000e18,
            minAmountOut: 0,
            nonce: nonce,
            deadline: deadline
        });

        // Sign with wrong private key
        bytes memory signature = _signSwapRequest(swapRequest, 2); // Wrong signer

        bool isValid = eip712Swap.verify(swapRequest, signature);
        assertFalse(isValid);
    }

    function test_ExecuteSwap() public {
        // Setup user tokens
        token0.mint(user1, 10000e18);
        vm.prank(user1);
        token0.approve(address(pool), type(uint256).max);

        uint256 nonce = eip712Swap.getNonce(user1);
        uint256 deadline = block.timestamp + 1 hours;

        ISwap.SwapRequest memory swapRequest = ISwap.SwapRequest({
            pool: address(pool),
            sender: user1,
            tokenIn: address(token0),
            tokenOut: address(token1),
            amountIn: 1000e18,
            minAmountOut: 0,
            nonce: nonce,
            deadline: deadline
        });

        bytes memory signature = _signSwapRequest(swapRequest, 1);

        uint256 balanceBefore = token1.balanceOf(user1);
        bool success = eip712Swap.executeSwap(swapRequest, signature);
        assertTrue(success);
        assertGt(token1.balanceOf(user1), balanceBefore);
        assertEq(eip712Swap.getNonce(user1), nonce + 1);
    }

    function test_RevertWhen_ExpiredSwapRequest() public {
        uint256 nonce = eip712Swap.getNonce(user1);
        uint256 deadline = block.timestamp - 1; // Already expired

        ISwap.SwapRequest memory swapRequest = ISwap.SwapRequest({
            pool: address(pool),
            sender: user1,
            tokenIn: address(token0),
            tokenOut: address(token1),
            amountIn: 1000e18,
            minAmountOut: 0,
            nonce: nonce,
            deadline: deadline
        });

        bytes memory signature = _signSwapRequest(swapRequest, 1);

        vm.expectRevert(EIP712Swap.ExpiredSwapRequest.selector);
        eip712Swap.executeSwap(swapRequest, signature);
    }

    function test_RevertWhen_InvalidNonce() public {
        uint256 nonce = 999; // Wrong nonce
        uint256 deadline = block.timestamp + 1 hours;

        ISwap.SwapRequest memory swapRequest = ISwap.SwapRequest({
            pool: address(pool),
            sender: user1,
            tokenIn: address(token0),
            tokenOut: address(token1),
            amountIn: 1000e18,
            minAmountOut: 0,
            nonce: nonce,
            deadline: deadline
        });

        bytes memory signature = _signSwapRequest(swapRequest, 1);

        vm.expectRevert(EIP712Swap.InvalidNonce.selector);
        eip712Swap.executeSwap(swapRequest, signature);
    }

    function test_RevertWhen_InvalidSignature() public {
        uint256 nonce = eip712Swap.getNonce(user1);
        uint256 deadline = block.timestamp + 1 hours;

        ISwap.SwapRequest memory swapRequest = ISwap.SwapRequest({
            pool: address(pool),
            sender: user1,
            tokenIn: address(token0),
            tokenOut: address(token1),
            amountIn: 1000e18,
            minAmountOut: 0,
            nonce: nonce,
            deadline: deadline
        });

        // Wrong signature - OpenZeppelin's ECDSA throws ECDSAInvalidSignature for invalid signatures
        bytes memory signature = abi.encodePacked(
            bytes32(0),
            bytes32(0),
            uint8(0)
        );

        // The verify function will return false, but executeSwap will revert with InvalidSignature
        // However, ECDSA.recover may revert with ECDSAInvalidSignature first
        vm.expectRevert(); // Accept any revert (could be ECDSAInvalidSignature or InvalidSignature)
        eip712Swap.executeSwap(swapRequest, signature);
    }
}
