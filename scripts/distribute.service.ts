import { BN } from '@project-serum/anchor';
import * as borsh from '@project-serum/borsh';
import { ACCOUNT_SIZE, createAccount, createInitializeAccountInstruction, createMint, getAccount,getMinimumBalanceForRentExemptAccount,mintTo,TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { TokenPocketWalletName } from '@solana/wallet-adapter-wallets';
import { AccountMeta, Transaction, TransactionInstruction, PublicKey, Connection, Keypair, LAMPORTS_PER_SOL, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import { logger } from 'ethers';
import BalanceTree from './balance-tree';
import { BorshService } from './borsh.service';
import { HashService } from './hash.service';
import MerkleTree from 'merkletreejs';
import { sha256 } from 'js-sha256';



//let connection = new Connection('https://api.devnet.solana.com', 'confirmed')
let connection = new Connection('http://127.0.0.1:8899', 'confirmed')
let programId = new PublicKey('GLfs2uXqmGoun5X4eTVxS7TcRPqw5dnsWvtEPzJzAq4v')



export class CreateDistributor {
    bump: number
    root: Buffer
    totalClaimed: BN
}

export class Claim {
    index: BN
    amount: BN
    proof: Buffer[]
}

export class CreateDistributorRequest {
    bump: number
    root: Buffer
    totalClaimed: BN
}

export class ClaimRequest {
    bump: number
    index: BN
    amount: BN
    proof: Buffer[]
}

const DISTRIBUTE_PROGRAM_LAYOUTS = {
    CREATE_DISTRIBUTOR: <borsh.Layout<CreateDistributor>> borsh.struct([
        borsh.u8('bump'),
        borsh.array<number>(borsh.u8(),32,'root'),
        borsh.i64('totalClaimed'),
    ]),

    CLAIM: <borsh.Layout<Claim>> borsh.struct([
        borsh.u8('bump'),
        borsh.u64('index'),
        borsh.u64('amount'),
        //borsh.vec<Array<number>>(borsh.array<number>(borsh.u8,32), 'proof'),
        borsh.vec(borsh.array(borsh.u8(),32), 'proof')
    ])
}


export async function getAirdrop(key: PublicKey) {
    const sig = await connection.requestAirdrop(
        key,
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


    let payer = Keypair.generate();
    await getAirdrop(payer.publicKey)
    let mintPubkey = await createMint(
        connection, // conneciton
        payer, // fee payer
        payer.publicKey, // mint authority
        payer.publicKey, // freeze authority (you can use `null` to disable it. when you disable it, you can't turn it on again)
        8 // decimals
      );
    
      const tokenAccount = Keypair.generate();
      console.log(`token account: ${tokenAccount.publicKey.toBase58()}`);
      const [distributorAddress, _bump] = await findDistributorAddress(payer.publicKey, programId);

      let tx = new Transaction().add(
        // create token account
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: tokenAccount.publicKey,
          space: ACCOUNT_SIZE,
          lamports: await getMinimumBalanceForRentExemptAccount(connection),
          programId: TOKEN_PROGRAM_ID,
        }),
        // init mint account
        createInitializeAccountInstruction(
          tokenAccount.publicKey, // token account
          mintPubkey, // mint
          //payer.publicKey // owner of token account
          distributorAddress
        )
      );
      console.log(`txhash: ${await connection.sendTransaction(tx, [payer, tokenAccount])}`);
    //   await mintTo(
    //     connection,
    //     payer,   
    //     mintPubkey,
    //     tokenAccount.publicKey,
    //     payer,
    //     100
    //   )


    // let tokenAccountSenderPubkey = await createAccount(
    //     connection, // connection
    //     payer, // fee payer
    //     mintPubkey, // mint
    //     payer.publicKey, // owner
    //     payer // token account (if you don't pass it, it will use ATA for you)
    // );

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
    console.log('distributorAddress is ',distributorAddress.toBase58());
    console.log('_bum is ', _bump);

    console.log("mintPubkey is", mintPubkey.toBase58())
    console.log("payer is", payer.publicKey.toBase58())
    //console.log("tokenAccountSenderPubkey", tokenAccountSenderPubkey.toBase58())
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

export async function claim(
    bump : number,
    index: BN,
    amount: BN,
    proof: Buffer[],
):Promise<void> {
        
    const request: ClaimRequest = {
        bump: bump,
        index: index,
        amount: amount,
        proof: proof
    }

    const data : Buffer = BorshService.anchorSerialize(
        'claim',
        DISTRIBUTE_PROGRAM_LAYOUTS.CLAIM,
        request,
        4000,
    )

    let mintPubkey = new PublicKey('C2qytwym3dRdbeR8tzpuNHkB5qerUwdX6RTLPetC9Mv9');
    const tokenAccountRecipent = Keypair.generate();
    
    let claimer = Keypair.generate()
    await getAirdrop(claimer.publicKey)

    let tokenAccountRecipentPubkey = await createAccount(
      connection, // connection
      claimer, // fee payer
      mintPubkey, // mint
      claimer.publicKey, // owner
      tokenAccountRecipent // token account (if you don't pass it, it will use ATA for you)
    );
    const tokenAccountSender = new PublicKey("47eKbxDKRAJSpmXHxShQ9TZ6brJL5PmJAtETudoU1s5c");
    const distributorAddress = new PublicKey("7mVN1Tg3pH4VQdEZ7bm9samRY5oQLSTotzZMruQjmfQK")
    
    const [statusAddress, _bump] = await findStatusAddress(distributorAddress, programId);
    // const [distributorAddress, _bump] = await findDistributorAddress(payer.publicKey, programId);
    // console.log("distributorAddress is", distributorAddress.toString() );
    //console.log("bump is", _bump)

    //const accounts = await connection.getProgramAccounts(programId);
    //console.log(accounts);
    
    // let tx = new Transaction().add(
    //     // create token account
    //     SystemProgram.createAccount({
    //       fromPubkey: payer,
    //       newAccountPubkey: status.publicKey,
    //       space: ACCOUNT_SIZE,
    //       lamports: await getMinimumBalanceForRentExemptAccount(connection),
    //       programId: TOKEN_PROGRAM_ID,
    //     }),
    
    //   );
    //   console.log(`txhash: ${await connection.sendTransaction(tx, [status, status])}`);
      

    const keys: AccountMeta[] = [
        <AccountMeta>{pubkey: distributorAddress, isSigner: false, isWritable: true},
        <AccountMeta>{pubkey: tokenAccountSender, isSigner: false, isWritable: true},
        <AccountMeta>{pubkey: tokenAccountRecipentPubkey, isSigner: false, isWritable: true},
        <AccountMeta>{pubkey: claimer.publicKey, isSigner: true, isWritable:true},
        <AccountMeta>{pubkey: statusAddress, isSigner: false, isWritable: true},
        <AccountMeta>{pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false},
        <AccountMeta>{pubkey: SystemProgram.programId, isSigner: false, isWritable: false},
    ]

    const instruction = new TransactionInstruction ({
        keys,
        data,
        programId: programId
    })

    const txSignature = await sendAndConfirmTransaction(
        connection,
        new Transaction().add(instruction),
        [claimer],
    )
    console.log(txSignature);
}

export async function findDistributorAddress(
    distributorAddress: PublicKey,
    distributeProgramId: PublicKey,
  ): Promise<[PublicKey, number]> {
    const prefix: Buffer = Buffer.from("Distributor")
    return PublicKey.findProgramAddress([prefix, distributorAddress.toBuffer()], distributeProgramId)
}

export async function findStatusAddress(
    distributorAddress: PublicKey,
    distributeProgramId: PublicKey,
  ): Promise<[PublicKey, number]> {
    const prefix: Buffer = Buffer.from("Status")
    console.log(prefix);
    return PublicKey.findProgramAddress([prefix, distributorAddress.toBuffer()], distributeProgramId)
}

// export async function findProof(
//     index: BN,
//     amount: BN
// ):Promise<string[]>{
//     const kpOne = Keypair.generate();
//     const kpTwo = Keypair.generate();
//     const kpThree = Keypair.generate();

//     const amountOne = new BN(100);
//     const amountTwo = new BN(101);
//     const amountThree = new BN(102);

//     const tree = new BalanceTree([
//         { account: kpOne.publicKey.toString(), amount: amountOne },
//         { account: kpTwo.publicKey.toString(), amount: amountTwo }, 
//         { account: kpThree.publicKey.toString(), amount: amountThree },
//       ]);
    
//     const proof = tree.getProof(index, kpOne.publicKey.toString(), amount);
//     return proof
// }

//createDistributor(254, Buffer.alloc(100), new BN(10), programId)

const leaves = ['a', 'b', 'c'].map(x => sha256(x))
const tree = new MerkleTree(leaves, sha256)
const root = tree.getRoot().toString('hex')
const leaf = sha256('a')
const proof = tree.getProof(leaf)
console.log(tree.verify(proof, leaf, root)) // true

claim(254, new BN(1),new BN(0), [])




