import { Connection, PublicKey } from '@solana/web3.js';
import { TransactionConfig } from 'web3-core';
import Web3 from 'web3';
import { NeonProxyRpcApi } from '../api';
import { MintPortal, NeonPortal } from '../core';
import { InstructionEvents, InstructionParams, SPLToken } from '../models';
import { getProxyInfo } from './proxy-status';

const urls = process.env.REACT_APP_URLS ? JSON.parse(process.env.REACT_APP_URLS) : {
  solanaRpcApi: 'https://api.devnet.solana.com',
  neonProxyRpcApi: 'https://proxy.devnet.neonlabs.org/solana'
};

export const proxyApi = new NeonProxyRpcApi({
  solanaRpcApi: urls.solanaRpcApi,
  neonProxyRpcApi: urls.neonProxyRpcApi
});

export function useNeonTransfer(events: InstructionEvents, connection: Connection, web3: Web3, publicKey: PublicKey, neonWalletAddress: string) {
  const proxyStatus = getProxyInfo(proxyApi);
  const options: InstructionParams = {
    connection: connection,
    solanaWalletAddress: publicKey,
    neonWalletAddress,
    web3,
    proxyApi: proxyApi,
    proxyStatus: proxyStatus
  };

  const neonPortal = new NeonPortal(options);
  const mintPortal = new MintPortal(options);

  const portalInstance = (addr: string) => {
    return proxyStatus.NEON_TOKEN_MINT === addr ? neonPortal : mintPortal;
  };

  const getEthereumTransactionParams = (amount: number, splToken: SPLToken): TransactionConfig => {
    const portal = portalInstance(splToken.address_spl);
    return portal.getEthereumTransactionParams.call(portal, amount, splToken);
  };

  const deposit = (amount: number, splToken: SPLToken): any => {
    const portal = portalInstance(splToken.address_spl);
    return portal.createNeonTransfer.call(portal, events, amount, splToken);
  };

  const withdraw = (amount: number, splToken: SPLToken): any => {
    const portal = portalInstance(splToken.address_spl);
    return portal.createSolanaTransfer.call(portal, events, amount, splToken);
  };

  return { deposit, withdraw, getEthereumTransactionParams, proxyStatus };
}