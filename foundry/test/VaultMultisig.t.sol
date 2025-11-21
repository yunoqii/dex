// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {VaultMultisig} from "../src/VaultMultisig.sol";
import {AccessManager} from "../src/AccessManager.sol";

contract VaultMultisigTest is Test {
    VaultMultisig public vault;
    AccessManager public accessManager;
    address public multisigAdmin;
    address public signer1;
    address public signer2;
    address public signer3;
    address public recipient;

    function setUp() public {
        multisigAdmin = address(0x10);
        signer1 = address(0x1);
        signer2 = address(0x2);
        signer3 = address(0x3);
        recipient = address(0x100);

        // Deploy AccessManager
        accessManager = new AccessManager();
        vm.prank(address(this));
        accessManager.addMultisigAdmin(multisigAdmin);

        // Deploy VaultMultisig
        address[] memory signers = new address[](3);
        signers[0] = signer1;
        signers[1] = signer2;
        signers[2] = signer3;
        uint256 quorum = 2;

        vault = new VaultMultisig(signers, quorum, address(accessManager));
    }

    function test_Constructor() public {
        assertEq(vault.quorum(), 2);
        assertEq(vault.currentMultiSigSigners(0), signer1);
        assertEq(vault.currentMultiSigSigners(1), signer2);
        assertEq(vault.currentMultiSigSigners(2), signer3);
    }

    function test_RevertWhen_EmptySignersArray() public {
        address[] memory signers = new address[](0);
        vm.expectRevert(VaultMultisig.SignersArrayCannotBeEmpty.selector);
        new VaultMultisig(signers, 1, address(accessManager));
    }

    function test_RevertWhen_QuorumGreaterThanSigners() public {
        address[] memory signers = new address[](2);
        signers[0] = signer1;
        signers[1] = signer2;
        vm.expectRevert(VaultMultisig.QuorumGreaterThanSigners.selector);
        new VaultMultisig(signers, 3, address(accessManager));
    }

    function test_RevertWhen_QuorumZero() public {
        address[] memory signers = new address[](2);
        signers[0] = signer1;
        signers[1] = signer2;
        vm.expectRevert(VaultMultisig.QuorumCannotBeZero.selector);
        new VaultMultisig(signers, 0, address(accessManager));
    }

    function test_InitiateTransfer() public {
        vm.prank(signer1);
        vault.initiateTransfer(recipient, 1 ether);

        (address to, uint256 amount, uint256 approvals, bool executed) = vault
            .getTransfer(0);
        assertEq(to, recipient);
        assertEq(amount, 1 ether);
        assertEq(approvals, 1);
        assertFalse(executed);
        assertTrue(vault.hasSignedTransfer(0, signer1));
    }

    function test_RevertWhen_InitiateTransferWithZeroAddress() public {
        vm.prank(signer1);
        vm.expectRevert(VaultMultisig.InvalidRecipient.selector);
        vault.initiateTransfer(address(0), 1 ether);
    }

    function test_RevertWhen_InitiateTransferWithZeroAmount() public {
        vm.prank(signer1);
        vm.expectRevert(VaultMultisig.InvalidAmount.selector);
        vault.initiateTransfer(recipient, 0);
    }

    function test_RevertWhen_NonSignerInitiateTransfer() public {
        vm.prank(address(0x999));
        vm.expectRevert(VaultMultisig.InvalidMultisigSigner.selector);
        vault.initiateTransfer(recipient, 1 ether);
    }

    function test_ApproveTransfer() public {
        vm.prank(signer1);
        vault.initiateTransfer(recipient, 1 ether);

        vm.prank(signer2);
        vault.approveTransfer(0);

        (address to, uint256 amount, uint256 approvals, bool executed) = vault
            .getTransfer(0);
        assertEq(approvals, 2);
        assertTrue(vault.hasSignedTransfer(0, signer2));
    }

    function test_RevertWhen_ApproveAlreadyExecutedTransfer() public {
        // Setup: fund vault and execute transfer
        vm.deal(address(vault), 10 ether);
        vm.prank(signer1);
        vault.initiateTransfer(recipient, 1 ether);
        vm.prank(signer2);
        vault.approveTransfer(0);
        vm.prank(signer1);
        vault.executeTransfer(0);

        vm.prank(signer3);
        vm.expectRevert(
            abi.encodeWithSelector(
                VaultMultisig.TransferIsAlreadyExecuted.selector,
                0
            )
        );
        vault.approveTransfer(0);
    }

    function test_RevertWhen_SignerAlreadyApproved() public {
        vm.prank(signer1);
        vault.initiateTransfer(recipient, 1 ether);

        vm.prank(signer1);
        vm.expectRevert(
            abi.encodeWithSelector(
                VaultMultisig.SignerAlreadyApproved.selector,
                signer1
            )
        );
        vault.approveTransfer(0);
    }

    function test_ExecuteTransfer() public {
        vm.deal(address(vault), 10 ether);
        uint256 recipientBalanceBefore = recipient.balance;

        vm.prank(signer1);
        vault.initiateTransfer(recipient, 1 ether);
        vm.prank(signer2);
        vault.approveTransfer(0);
        vm.prank(signer1);
        vault.executeTransfer(0);

        assertEq(recipient.balance, recipientBalanceBefore + 1 ether);
        (address to, uint256 amount, uint256 approvals, bool executed) = vault
            .getTransfer(0);
        assertTrue(executed);
    }

    function test_RevertWhen_ExecuteTransferWithoutQuorum() public {
        vm.deal(address(vault), 10 ether);
        vm.prank(signer1);
        vault.initiateTransfer(recipient, 1 ether);

        vm.prank(signer1);
        vm.expectRevert(
            abi.encodeWithSelector(
                VaultMultisig.QuorumHasNotBeenReached.selector,
                0
            )
        );
        vault.executeTransfer(0);
    }

    function test_RevertWhen_ExecuteTransferInsufficientBalance() public {
        vm.deal(address(vault), 0.5 ether);
        vm.prank(signer1);
        vault.initiateTransfer(recipient, 1 ether);
        vm.prank(signer2);
        vault.approveTransfer(0);

        vm.prank(signer1);
        vm.expectRevert();
        vault.executeTransfer(0);
    }

    function test_InitiateOperation() public {
        bytes memory data = abi.encodeWithSignature(
            "transfer(address,uint256)",
            recipient,
            1 ether
        );
        string memory description = "Transfer tokens";

        vm.prank(signer1);
        vault.initiateOperation(recipient, data, description);

        (
            address target,
            bytes memory opData,
            string memory opDescription,
            uint256 approvals,
            bool executed
        ) = vault.getOperation(0);

        assertEq(target, recipient);
        assertEq(keccak256(opData), keccak256(data));
        assertEq(approvals, 1);
        assertFalse(executed);
        assertTrue(vault.hasSignedOperation(0, signer1));
    }

    function test_RevertWhen_InitiateOperationWithZeroAddress() public {
        bytes memory data = abi.encodeWithSignature(
            "transfer(address,uint256)",
            recipient,
            1 ether
        );
        vm.prank(signer1);
        vm.expectRevert(VaultMultisig.InvalidTarget.selector);
        vault.initiateOperation(address(0), data, "Test");
    }

    function test_RevertWhen_InitiateOperationWithEmptyData() public {
        vm.prank(signer1);
        vm.expectRevert(VaultMultisig.InvalidOperationData.selector);
        vault.initiateOperation(recipient, "", "Test");
    }

    function test_ApproveOperation() public {
        bytes memory data = abi.encodeWithSignature(
            "transfer(address,uint256)",
            recipient,
            1 ether
        );
        vm.prank(signer1);
        vault.initiateOperation(recipient, data, "Test");

        vm.prank(signer2);
        vault.approveOperation(0);

        (
            address target,
            bytes memory opData,
            string memory opDescription,
            uint256 approvals,
            bool executed
        ) = vault.getOperation(0);
        assertEq(approvals, 2);
        assertTrue(vault.hasSignedOperation(0, signer2));
    }

    function test_ExecuteOperation() public {
        vm.deal(recipient, 0);
        bytes memory data = abi.encodeWithSignature("receive()");
        vm.prank(signer1);
        vault.initiateOperation(recipient, data, "Receive ETH");
        vm.prank(signer2);
        vault.approveOperation(0);

        vm.deal(address(vault), 1 ether);
        vm.prank(signer1);
        vault.executeOperation(0);

        (
            address target,
            bytes memory opData,
            string memory opDescription,
            uint256 approvals,
            bool executed
        ) = vault.getOperation(0);
        assertTrue(executed);
    }

    function test_RevertWhen_ExecuteOperationWithoutQuorum() public {
        bytes memory data = abi.encodeWithSignature(
            "transfer(address,uint256)",
            recipient,
            1 ether
        );
        vm.prank(signer1);
        vault.initiateOperation(recipient, data, "Test");

        vm.prank(signer1);
        vm.expectRevert(
            abi.encodeWithSelector(
                VaultMultisig.OperationQuorumHasNotBeenReached.selector,
                0
            )
        );
        vault.executeOperation(0);
    }

    function test_UpdateSigners() public {
        // First, initiate a transfer before updating signers
        vm.prank(signer1);
        vault.initiateTransfer(recipient, 1 ether);

        // Now update signers
        address[] memory newSigners = new address[](2);
        newSigners[0] = signer1;
        newSigners[1] = address(0x4);

        vm.prank(multisigAdmin);
        vault.updateSigners(newSigners);

        assertEq(vault.currentMultiSigSigners(0), signer1);
        assertEq(vault.currentMultiSigSigners(1), address(0x4));
        // Check that signer1 can still sign the transfer initiated before the update
        assertTrue(vault.hasSignedTransfer(0, signer1));
    }

    function test_RevertWhen_UpdateSignersWithEmptyArray() public {
        address[] memory newSigners = new address[](0);
        vm.prank(multisigAdmin);
        vm.expectRevert(VaultMultisig.SignersArrayCannotBeEmpty.selector);
        vault.updateSigners(newSigners);
    }

    function test_RevertWhen_UpdateSignersWithLessThanQuorum() public {
        address[] memory newSigners = new address[](1);
        newSigners[0] = signer1;
        vm.prank(multisigAdmin);
        vm.expectRevert(VaultMultisig.QuorumGreaterThanSigners.selector);
        vault.updateSigners(newSigners);
    }

    function test_RevertWhen_NonAdminUpdatesSigners() public {
        address[] memory newSigners = new address[](2);
        newSigners[0] = signer1;
        newSigners[1] = signer2;
        vm.prank(signer1);
        vm.expectRevert(VaultMultisig.InvalidMultisigAdmin.selector);
        vault.updateSigners(newSigners);
    }

    function test_UpdateQuorum() public {
        vm.prank(multisigAdmin);
        vault.updateQuorum(3);
        assertEq(vault.quorum(), 3);
    }

    function test_RevertWhen_UpdateQuorumGreaterThanSigners() public {
        vm.prank(multisigAdmin);
        vm.expectRevert(VaultMultisig.QuorumGreaterThanSigners.selector);
        vault.updateQuorum(4);
    }

    function test_RevertWhen_UpdateQuorumToZero() public {
        vm.prank(multisigAdmin);
        vm.expectRevert(VaultMultisig.QuorumCannotBeZero.selector);
        vault.updateQuorum(0);
    }

    function test_RevertWhen_NonAdminUpdatesQuorum() public {
        vm.prank(signer1);
        vm.expectRevert(VaultMultisig.InvalidMultisigAdmin.selector);
        vault.updateQuorum(3);
    }

    function test_GetTransferCount() public {
        assertEq(vault.getTransferCount(), 0);
        vm.prank(signer1);
        vault.initiateTransfer(recipient, 1 ether);
        assertEq(vault.getTransferCount(), 1);
    }

    function test_GetOperationCount() public {
        assertEq(vault.getOperationCount(), 0);
        bytes memory data = abi.encodeWithSignature(
            "transfer(address,uint256)",
            recipient,
            1 ether
        );
        vm.prank(signer1);
        vault.initiateOperation(recipient, data, "Test");
        assertEq(vault.getOperationCount(), 1);
    }

    function test_Receive() public {
        vm.deal(address(this), 1 ether);
        (bool success, ) = address(vault).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(address(vault).balance, 1 ether);
    }
}
