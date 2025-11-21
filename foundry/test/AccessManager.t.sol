// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {AccessManager} from "../src/AccessManager.sol";
import {Roles} from "../src/Roles.sol";

contract AccessManagerTest is Test {
    AccessManager public accessManager;
    address public admin;
    address public user1;
    address public user2;

    event RoleGranted(
        bytes32 indexed role,
        address indexed account,
        address indexed sender
    );
    event RoleRevoked(
        bytes32 indexed role,
        address indexed account,
        address indexed sender
    );

    function setUp() public {
        admin = address(this);
        user1 = address(0x1);
        user2 = address(0x2);

        accessManager = new AccessManager();
    }

    function test_InitialAdminRole() public {
        assertTrue(
            accessManager.hasRole(accessManager.DEFAULT_ADMIN_ROLE(), admin)
        );
        // Note: isAdmin() checks for ADMIN_ROLE, not DEFAULT_ADMIN_ROLE
        // The constructor only grants DEFAULT_ADMIN_ROLE, not ADMIN_ROLE
        // So isAdmin(admin) will be false until addAdmin() is called
        assertFalse(accessManager.isAdmin(admin));
    }

    function test_AddAdmin() public {
        accessManager.addAdmin(user1);
        assertTrue(accessManager.isAdmin(user1));
        assertTrue(accessManager.hasRole(Roles.ADMIN_ROLE, user1));
    }

    function test_RemoveAdmin() public {
        accessManager.addAdmin(user1);
        assertTrue(accessManager.isAdmin(user1));

        accessManager.removeAdmin(user1);
        assertFalse(accessManager.isAdmin(user1));
        assertFalse(accessManager.hasRole(Roles.ADMIN_ROLE, user1));
    }

    function test_AddMultisigAdmin() public {
        accessManager.addMultisigAdmin(user1);
        assertTrue(accessManager.isMultisigAdmin(user1));
        assertTrue(accessManager.hasRole(Roles.MULTISIG_ADMIN_ROLE, user1));
    }

    function test_RemoveMultisigAdmin() public {
        accessManager.addMultisigAdmin(user1);
        assertTrue(accessManager.isMultisigAdmin(user1));

        accessManager.removeMultisigAdmin(user1);
        assertFalse(accessManager.isMultisigAdmin(user1));
        assertFalse(accessManager.hasRole(Roles.MULTISIG_ADMIN_ROLE, user1));
    }

    function test_AddEIP712Swapper() public {
        accessManager.addEIP712Swapper(user1);
        assertTrue(accessManager.isEIP712Swapper(user1));
        assertTrue(
            accessManager.hasRole(Roles.ALLOWED_EIP712_SWAP_ROLE, user1)
        );
    }

    function test_RemoveEIP712Swapper() public {
        accessManager.addEIP712Swapper(user1);
        assertTrue(accessManager.isEIP712Swapper(user1));

        accessManager.removeEIP712Swapper(user1);
        assertFalse(accessManager.isEIP712Swapper(user1));
        assertFalse(
            accessManager.hasRole(Roles.ALLOWED_EIP712_SWAP_ROLE, user1)
        );
    }

    function test_RevertWhen_NonAdminAddsAdmin() public {
        vm.prank(user1);
        vm.expectRevert();
        accessManager.addAdmin(user2);
    }

    function test_RevertWhen_NonAdminRemovesAdmin() public {
        accessManager.addAdmin(user1);
        vm.prank(user2);
        vm.expectRevert();
        accessManager.removeAdmin(user1);
    }

    function test_MultipleAdmins() public {
        accessManager.addAdmin(user1);
        accessManager.addAdmin(user2);

        assertTrue(accessManager.isAdmin(user1));
        assertTrue(accessManager.isAdmin(user2));
    }

    function test_MultipleMultisigAdmins() public {
        accessManager.addMultisigAdmin(user1);
        accessManager.addMultisigAdmin(user2);

        assertTrue(accessManager.isMultisigAdmin(user1));
        assertTrue(accessManager.isMultisigAdmin(user2));
    }

    function test_MultipleEIP712Swappers() public {
        accessManager.addEIP712Swapper(user1);
        accessManager.addEIP712Swapper(user2);

        assertTrue(accessManager.isEIP712Swapper(user1));
        assertTrue(accessManager.isEIP712Swapper(user2));
    }
}
