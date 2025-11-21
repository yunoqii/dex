// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {EIP712Swap} from "../src/EIP712Swap.sol";

contract DeployEIP712Swap is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        EIP712Swap eip712Swap = new EIP712Swap();

        console.log("EIP712Swap deployed at:", address(eip712Swap));
        console.log(
            "Domain separator:",
            vm.toString(eip712Swap.getDomainSeparator())
        );

        vm.stopBroadcast();
    }
}
