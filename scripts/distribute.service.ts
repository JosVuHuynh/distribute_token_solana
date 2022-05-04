import { BN } from '@project-serum/anchor';
import * as borsh from '@project-serum/borsh';
import { ACCOUNT_SIZE, createAccount, createInitializeAccountInstruction, createMint, createMintToCheckedInstruction, getAccount,getMinimumBalanceForRentExemptAccount,getMint,getOrCreateAssociatedTokenAccount,mintTo,mintToChecked,TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { TokenPocketWalletName } from '@solana/wallet-adapter-wallets';
import { AccountMeta, Transaction, TransactionInstruction, PublicKey, Connection, Keypair, LAMPORTS_PER_SOL, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import { BorshService } from './borsh.service';
import { HashService } from './hash.service';
//import MerkleTree from 'merkletreejs';
import { MerkleTree  } from './merkle_tree';
import keccak256 from 'keccak256'
import { keccak_256 } from "js-sha3";
 


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

export class CreateAccountDistributor {
    mint: PublicKey
    payer: Keypair
    tokenAccountSender: PublicKey
    distributorAddress: PublicKey
    bump: number
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

export async function createDistributor(
    root: Buffer,
    totalClaimed: BN,
    distributeProgramId: PublicKey,
    _mint: PublicKey,
    _payer: Keypair,
    _distributorAddress: PublicKey,
    _bump: number
): Promise<void> {
    const payer = _payer
    const mintPubkey = _mint
    const distributorAddress = _distributorAddress
    const transaction: Transaction = new Transaction();
    const request: CreateDistributorRequest = {
        bump: _bump,
        root: root,
        totalClaimed: totalClaimed
    }

    const data: Buffer = BorshService.anchorSerialize(
        'create_distributor',
        DISTRIBUTE_PROGRAM_LAYOUTS.CREATE_DISTRIBUTOR,
        request,
        4000
    )

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
    index: BN,
    amount: BN,
    proof: Buffer[],
    _mintPubkey: PublicKey,
    _tokenAccountSender: PublicKey,
    _distributeAddress: PublicKey,
    claimer: Keypair

):Promise<void> {
    const tokenAccountSender = _tokenAccountSender
    const distributorAddress = _distributeAddress
    let mintPubkey = _mintPubkey

    const [statusAddress, _bump] = await findStatusAddress(distributorAddress, programId);
    
    const request: ClaimRequest = {
        bump: _bump,
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

    const tokenAccountRecipent = Keypair.generate();
    
    await getAirdrop(claimer.publicKey)

    let tokenAccountRecipentPubkey = await createAccount(
      connection, // connection
      claimer, // fee payer
      mintPubkey, // mint
      claimer.publicKey, // owner
      tokenAccountRecipent // token account (if you don't pass it, it will use ATA for you)
    );
  

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


export async function createAccountDistributor():Promise<CreateAccountDistributor>{
    let payer = Keypair.generate();

    await getAirdrop(payer.publicKey)
    let mintPubkey = await createMint(
        connection, // conneciton
        payer, // fee payer
        payer.publicKey, // mint authority
        payer.publicKey, // freeze authority (you can use `null` to disable it. when you disable it, you can't turn it on again)
        8 // decimals
      );

    const [distributorAddress, _bump] = await findDistributorAddress(payer.publicKey, programId);
    
    // Get the token account of the fromWallet address, and if it does not exist, create it
    const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mintPubkey,
        distributorAddress,
        true
    );

    await mintTo(
        connection,
        payer,
        mintPubkey,
        fromTokenAccount.address,
        payer,
        1000000
        );
  
    let createAccountDistributor :CreateAccountDistributor = {
    mint: mintPubkey,
    payer: payer,
    tokenAccountSender: fromTokenAccount.address,
    distributorAddress: distributorAddress,
    bump: _bump
    };
   
    return createAccountDistributor
}

const kpOne = Keypair.generate();
const kpTwo = Keypair.generate();
const kpThree = Keypair.generate();
const claimer = Keypair.generate();

const buf =  Buffer.from(keccak256(Buffer.concat([
    new BN(0).toArrayLike(Buffer, "le", 8),
    claimer.publicKey.toBuffer(),
    new BN(10).toArrayLike(Buffer, "le", 8),
  ])));


const leaves = [
   
    Buffer.from(keccak256(Buffer.concat([
        new BN(0).toArrayLike(Buffer, "le", 8),
        claimer.publicKey.toBuffer(),
        new BN(10).toArrayLike(Buffer, "le", 8),
    ]))),

    Buffer.from(keccak256(Buffer.concat([
        new BN(1).toArrayLike(Buffer, "le", 8),
        kpOne.publicKey.toBuffer(),
        new BN(5).toArrayLike(Buffer, "le", 8),
    ]))),

    Buffer.from(keccak256(Buffer.concat([
        new BN(2).toArrayLike(Buffer, "le", 8),
        kpTwo.publicKey.toBuffer(),
        new BN(15).toArrayLike(Buffer, "le", 8),
    ]))),
    Buffer.from(keccak256(Buffer.concat([
        new BN(3).toArrayLike(Buffer, "le", 8),
        kpThree.publicKey.toBuffer(),
        new BN(20).toArrayLike(Buffer, "le", 8),
    ]))),
]

export function getProof(tree: MerkleTree, index: number) : Buffer[] {
    const nodes = tree.nodes();
    const proofs = [];
    let currentIndex = index;
    for (let i = 0; i < nodes.length - 1; i++) {
        const proof = currentIndex % 2 == 0 ? nodes[i][currentIndex + 1] : nodes[i][currentIndex - 1];
        currentIndex = (currentIndex - (currentIndex % 2)) / 2;
        proofs.push(proof);
    }
    let buffer: Buffer[] = [];
    proofs.forEach(x=> buffer.push(x.hash))
    return buffer
}


const merkleTree = new MerkleTree(leaves)
const root = merkleTree.root()
let proof =  getProof(merkleTree, 0)
const leaf = buf

const main = async () => {
    const distributorAccount = await createAccountDistributor();

    await createDistributor(
        root.hash,
        new BN(10), 
        programId, 
        distributorAccount.mint, 
        distributorAccount.payer, 
        distributorAccount.distributorAddress, 
        distributorAccount.bump
        )

    await claim(
        new BN(0),
        new BN(10), 
        proof, 
        distributorAccount.mint, 
        distributorAccount.tokenAccountSender, 
        distributorAccount.distributorAddress, 
        claimer
        )
    const tokenAccountInfo = await getAccount(
        connection,
        distributorAccount.tokenAccountSender
      )
    console.log("token account after redeem is", tokenAccountInfo.amount);
}

main()
  .then(() => {
    console.log("Success");
  })
  .catch((e) => {
    console.error(e);
  });


