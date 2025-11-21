// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {AccessManager} from "../src/AccessManager.sol";

contract DeployAccessManager is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        AccessManager accessManager = new AccessManager();

        console.log("AccessManager deployed at:", address(accessManager));

        vm.stopBroadcast();
    }
}
