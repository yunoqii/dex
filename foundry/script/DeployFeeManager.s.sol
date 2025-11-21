// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {FeeManager} from "../src/FeeManager.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract DeployFeeManager is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Fee in basis points (e.g., 250 = 2.5%)
        uint256 fee = vm.envOr("FEE", uint256(250));

        // Deploy implementation
        FeeManager implementation = new FeeManager();

        // Deploy proxy
        bytes memory initData = abi.encodeWithSelector(
            FeeManager.initialize.selector,
            fee
        );
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            initData
        );
        FeeManager feeManager = FeeManager(address(proxy));

        console.log(
            "FeeManager implementation deployed at:",
            address(implementation)
        );
        console.log("FeeManager proxy deployed at:", address(feeManager));
        console.log("Fee set to:", fee, "basis points");

        vm.stopBroadcast();
    }
}
