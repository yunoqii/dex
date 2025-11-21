// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {LiquidityPoolFactory} from "../src/LiquidityPoolFactory.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";

contract DeployLiquidityPool is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        address factoryAddress = vm.envAddress("LIQUIDITY_POOL_FACTORY");
        address token0 = vm.envAddress("TOKEN0");
        uint256 token0Decimals = vm.envOr("TOKEN0_DECIMALS", uint256(18));
        address token1 = vm.envAddress("TOKEN1");
        uint256 token1Decimals = vm.envOr("TOKEN1_DECIMALS", uint256(18));
        address admin = vm.envOr("POOL_ADMIN", vm.addr(deployerPrivateKey));

        LiquidityPoolFactory factory = LiquidityPoolFactory(factoryAddress);

        // Create pool using factory
        address poolAddress = factory.createPool(
            token0,
            token0Decimals,
            token1,
            token1Decimals,
            admin
        );

        LiquidityPool pool = LiquidityPool(poolAddress);

        console.log("=== LiquidityPool Creation ===");
        console.log("Pool created at:", poolAddress);
        console.log("Token0:", token0);
        console.log("Token0 decimals:", token0Decimals);
        console.log("Token1:", token1);
        console.log("Token1 decimals:", token1Decimals);
        console.log("Admin:", admin);
        console.log("Factory:", factoryAddress);

        // Optional: Add initial liquidity if amounts are provided
        uint256 token0Amount = vm.envOr("INITIAL_TOKEN0_AMOUNT", uint256(0));
        uint256 token1Amount = vm.envOr("INITIAL_TOKEN1_AMOUNT", uint256(0));

        if (token0Amount > 0 || token1Amount > 0) {
            console.log("\n=== Adding Initial Liquidity ===");
            if (token0Amount > 0) {
                console.log("Adding", token0Amount, "of token0");
                pool.addLiquidity(token0, token0Amount);
            }
            if (token1Amount > 0) {
                console.log("Adding", token1Amount, "of token1");
                pool.addLiquidity(token1, token1Amount);
            }
            (uint256 reserve0, uint256 reserve1) = pool.getReserves();
            console.log("Reserve Token0:", reserve0);
            console.log("Reserve Token1:", reserve1);
        }

        vm.stopBroadcast();
    }
}
