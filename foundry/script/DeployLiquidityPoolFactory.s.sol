// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {LiquidityPoolFactory} from "../src/LiquidityPoolFactory.sol";
import {FeeManager} from "../src/FeeManager.sol";
import {EIP712Swap} from "../src/EIP712Swap.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract DeployLiquidityPoolFactory is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        address feeManager = vm.envAddress("FEE_MANAGER");
        address eip712Swap = vm.envAddress("EIP712_SWAP");

        LiquidityPoolFactory factory = new LiquidityPoolFactory(
            feeManager,
            eip712Swap
        );

        console.log("=== LiquidityPoolFactory Deployment ===");
        console.log("Factory deployed at:", address(factory));
        console.log(
            "Master implementation:",
            address(factory.masterImplementation())
        );
        console.log("FeeManager:", feeManager);
        console.log("EIP712Swap:", eip712Swap);

        vm.stopBroadcast();
    }
}
