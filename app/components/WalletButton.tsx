"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";

export default function WalletButton() {
    const [account, setAccount] = useState<string | null>(null);

    useEffect(() => {
        const checkConnection = async () => {
            if (typeof window.ethereum !== "undefined") {
                const provider = new ethers.BrowserProvider(window.ethereum);
                const accounts = await provider.listAccounts();
                if (accounts.length > 0) {
                    setAccount(accounts[0].address);
                }
            }
        };
        checkConnection();
    }, []);

    const connectWallet = async () => {
        if (typeof window.ethereum === "undefined") {
            alert("Please install MetaMask!");
            return;
        }

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            const signer = await provider.getSigner();
            const address = await signer.getAddress();
            setAccount(address);
        } catch (error) {
            console.error("Error connecting wallet:", error);
            alert("Failed to connect wallet");
        }
    };

    const disconnect = () => {
        setAccount(null);
    };

    return (
        <div className="flex items-center gap-4">
            {account ? (
                <>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                        {account.slice(0, 6)}...{account.slice(-4)}
                    </span>
                    <button
                        onClick={disconnect}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                    >
                        Disconnect
                    </button>
                </>
            ) : (
                <button
                    onClick={connectWallet}
                    className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                >
                    Connect Wallet
                </button>
            )}
        </div>
    );
}

