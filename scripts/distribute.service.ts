import { BN } from '@project-serum/anchor';
import * as borsh from '@project-serum/borsh';
import { createMint } from '@solana/spl-token';
import { AccountMeta, Transaction, TransactionInstruction, PublicKey, Connection, Keypair, LAMPORTS_PER_SOL, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import { BorshService } from './borsh.service';
import { HashService } from './hash.service';

let connection = new Connection('https://api.devnet.solana.com', 'confirmed')

let payer = Keypair.generate();

let programId = new PublicKey('GLfs2uXqmGoun5X4eTVxS7TcRPqw5dnsWvtEPzJzAq4v')

export class CreateDistributor {
    bump: number
    root: Buffer
    totalClaimed: BN
}

// export class Claim {
//     index: number
//     amount: number
//     proof: number[][]
// }

export class CreateDistributorRequest {
    bump: number
    root: Buffer
    totalClaimed: BN
}

const DISTRIBUTE_PROGRAM_LAYOUTS = {
    CREATE_DISTRIBUTOR: <borsh.Layout<CreateDistributor>> borsh.struct([
        borsh.u8('bump'),
        borsh.array<number>(borsh.u8(),32,'root'),
        borsh.i64('totalClaimed'),
    ]),

    // CLAIM: <borsh.Layout<Claim>> borsh.struct([
    //     borsh.u64('index'),
    //     borsh.u64('amount'),
    //     borsh.vec(Array)(borsh.array<number>(borsh.u8,32), 'proof'),
    // ])
}


export async function getAirdrop() {
    const sig = await connection.requestAirdrop(
        payer.publicKey,
        LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(sig);
    console.log('using account',sig);
}

//export class DistributeService {
export async function createDistributor(
    bump: number,
    root: Buffer,
    totalClaimed: BN,
    distributeProgramId: PublicKey,
): Promise<void> {

    await getAirdrop()
    const transaction: Transaction = new Transaction();
    const request: CreateDistributorRequest = {
        bump: bump,
        root: root,
        totalClaimed: totalClaimed
    }

    const data: Buffer = BorshService.anchorSerialize(
        'create_distributor',
        DISTRIBUTE_PROGRAM_LAYOUTS.CREATE_DISTRIBUTOR,
        request,
        4000
    )
    const [distributorAddress, _bump] = await findDistributorAddress(payer.publicKey, programId);
    
    let mintPubkey = await createMint(
        connection, // conneciton
        payer, // fee payer
        payer.publicKey, // mint authority
        payer.publicKey, // freeze authority (you can use `null` to disable it. when you disable it, you can't turn it on again)
        8 // decimals
      );
    const keys: AccountMeta[] = [
        <AccountMeta>{pubkey: payer.publicKey, isSigner: true, isWritable: true },
        <AccountMeta>{pubkey: distributorAddress, isSigner: false, isWritable: true },
        <AccountMeta>{pubkey: mintPubkey, isSigner: false, isWritable: false },
        <AccountMeta>{pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]

    const instruction = new TransactionInstruction({
        keys,
        data,
        programId: distributeProgramId
    })

    const txSignature = await sendAndConfirmTransaction(
        connection,
        new Transaction().add(instruction),
        [payer],
    );
    console.log(txSignature)
}

export async function findDistributorAddress(
    distributorAddress: PublicKey,
    distributeProgramId: PublicKey,
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress([distributorAddress.toBuffer()], distributeProgramId)
  }

createDistributor(255, Buffer.alloc(100), new BN(10), programId);