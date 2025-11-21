// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract DeployERC20Tokens is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deploying from:", deployer);

        // Deploy Token A
        console.log("\n=== Deploying Token A ===");
        MockERC20 tokenA = new MockERC20("Token A", "TKA", 18);
        console.log("Token A address:", address(tokenA));
        console.log("Token A name: Token A");
        console.log("Token A symbol: TKA");
        console.log("Token A decimals: 18");

        // Mint some tokens to deployer
        tokenA.mint(deployer, 1000000 * 10 ** 18);
        console.log("Minted 1,000,000 TKA to deployer");

        // Deploy Token B
        console.log("\n=== Deploying Token B ===");
        MockERC20 tokenB = new MockERC20("Token B", "TKB", 18);
        console.log("Token B address:", address(tokenB));
        console.log("Token B name: Token B");
        console.log("Token B symbol: TKB");
        console.log("Token B decimals: 18");

        // Mint some tokens to deployer
        tokenB.mint(deployer, 1000000 * 10 ** 18);
        console.log("Minted 1,000,000 TKB to deployer");

        console.log("\n=== Deployment Summary ===");
        console.log("Token A (TKA):", address(tokenA));
        console.log("Token B (TKB):", address(tokenB));
        console.log("\nYou can now use these tokens to:");
        console.log("1. Create a liquidity pool");
        console.log("2. Add liquidity");
        console.log("3. Swap tokens");

        vm.stopBroadcast();
    }
}
