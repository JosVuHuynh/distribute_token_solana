import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { DistributeTokenSolana } from '../target/types/distribute_token_solana';

describe('distribute-token-solana', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.DistributeTokenSolana as Program<DistributeTokenSolana>;

  it('Is initialized!', async () => {
    // Add your test here.
    const tx = await program.rpc.initialize({});
    console.log("Your transaction signature", tx);
  });
});
