// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {AccessManager} from "../src/AccessManager.sol";
import {FeeManager} from "../src/FeeManager.sol";
import {EIP712Swap} from "../src/EIP712Swap.sol";
import {LiquidityPoolFactory} from "../src/LiquidityPoolFactory.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";
import {VaultMultisig} from "../src/VaultMultisig.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract DeployAll is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deploying from:", deployer);

        // 1. Deploy AccessManager
        console.log("\n=== Deploying AccessManager ===");
        AccessManager accessManager = new AccessManager();
        console.log("AccessManager:", address(accessManager));

        // 2. Deploy FeeManager
        console.log("\n=== Deploying FeeManager ===");
        uint256 fee = vm.envOr("FEE", uint256(250));
        FeeManager feeManagerImpl = new FeeManager();
        bytes memory initData = abi.encodeWithSelector(
            FeeManager.initialize.selector,
            fee
        );
        ERC1967Proxy feeManagerProxy = new ERC1967Proxy(
            address(feeManagerImpl),
            initData
        );
        FeeManager feeManager = FeeManager(address(feeManagerProxy));
        console.log("FeeManager implementation:", address(feeManagerImpl));
        console.log("FeeManager proxy:", address(feeManager));
        console.log("Fee:", fee, "basis points");

        // 3. Deploy EIP712Swap
        console.log("\n=== Deploying EIP712Swap ===");
        EIP712Swap eip712Swap = new EIP712Swap();
        console.log("EIP712Swap:", address(eip712Swap));

        // 4. Deploy LiquidityPoolFactory
        console.log("\n=== Deploying LiquidityPoolFactory ===");
        LiquidityPoolFactory factory = new LiquidityPoolFactory(
            address(feeManager),
            address(eip712Swap)
        );
        console.log("LiquidityPoolFactory:", address(factory));
        console.log(
            "Master implementation:",
            address(factory.masterImplementation())
        );

        // 5. Create LiquidityPool (optional)
        _deployPoolIfNeeded(factory, deployer);

        // 6. Deploy VaultMultisig (optional)
        _deployVaultIfNeeded(accessManager);

        console.log("\n=== Deployment Summary ===");
        console.log("AccessManager:", address(accessManager));
        console.log("FeeManager:", address(feeManager));
        console.log("EIP712Swap:", address(eip712Swap));
        console.log("LiquidityPoolFactory:", address(factory));

        vm.stopBroadcast();
    }

    function _deployPoolIfNeeded(
        LiquidityPoolFactory factory,
        address admin
    ) internal {
        address token0 = vm.envOr("TOKEN0", address(0));
        address token1 = vm.envOr("TOKEN1", address(0));
        if (token0 == address(0) || token1 == address(0)) {
            console.log(
                "\n=== Skipping LiquidityPool creation (TOKEN0 and TOKEN1 not set) ==="
            );
            return;
        }

        console.log("\n=== Creating LiquidityPool ===");
        uint256 token0Decimals = vm.envOr("TOKEN0_DECIMALS", uint256(18));
        uint256 token1Decimals = vm.envOr("TOKEN1_DECIMALS", uint256(18));
        address poolAddress = factory.createPool(
            token0,
            token0Decimals,
            token1,
            token1Decimals,
            admin
        );
        console.log("LiquidityPool:", poolAddress);
        console.log("Token0:", token0);
        console.log("Token1:", token1);
    }

    function _deployVaultIfNeeded(AccessManager accessManager) internal {
        string memory signersStr = vm.envOr("SIGNERS", string(""));
        if (bytes(signersStr).length == 0) {
            console.log("\n=== Skipping VaultMultisig (SIGNERS not set) ===");
            return;
        }

        console.log("\n=== Deploying VaultMultisig ===");
        string[] memory signerStrings = vm.split(signersStr, ",");
        address[] memory signers = new address[](signerStrings.length);
        for (uint256 i = 0; i < signerStrings.length; i++) {
            signers[i] = vm.parseAddress(signerStrings[i]);
        }

        uint256 quorum = vm.envOr("QUORUM", uint256(2));
        require(quorum > 0 && quorum <= signers.length, "Invalid quorum");

        VaultMultisig vault = new VaultMultisig(
            signers,
            quorum,
            address(accessManager)
        );
        console.log("VaultMultisig:", address(vault));
        console.log("Quorum:", quorum);
        console.log("Number of signers:", signers.length);
    }
}
