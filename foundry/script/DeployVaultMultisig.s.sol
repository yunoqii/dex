// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {VaultMultisig} from "../src/VaultMultisig.sol";
import {AccessManager} from "../src/AccessManager.sol";

contract DeployVaultMultisig is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        address accessManager = vm.envAddress("ACCESS_MANAGER");

        // Read signers from environment variable (comma-separated addresses)
        string memory signersStr = vm.envString("SIGNERS");
        string[] memory signerStrings = vm.split(signersStr, ",");
        address[] memory signers = new address[](signerStrings.length);

        for (uint256 i = 0; i < signerStrings.length; i++) {
            signers[i] = vm.parseAddress(signerStrings[i]);
        }

        uint256 quorum = vm.envOr("QUORUM", uint256(2));

        // Validate quorum
        require(quorum > 0, "Quorum must be greater than 0");
        require(
            quorum <= signers.length,
            "Quorum cannot exceed number of signers"
        );

        VaultMultisig vault = new VaultMultisig(signers, quorum, accessManager);

        console.log("VaultMultisig deployed at:", address(vault));
        console.log("Quorum:", quorum);
        console.log("Number of signers:", signers.length);
        console.log("AccessManager:", accessManager);

        vm.stopBroadcast();
    }
}
