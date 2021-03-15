const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const SHA256 = require("crypto-js/sha256");

class Record {
    constructor(fromAddress, toAddress, value){
        this.fromAddress = fromAddress;
        this.toAddress = toAddress;
        this.value = value;
    }

    calculateHash() {
        return SHA256(this.fromAddress + this.toAddress + this.value).toString();
    }

    signRecord(signingKey) {
        if (signingKey.getPublic('hex') !== this.fromAddress) {
            throw new Error('You cannot send records from other users!');
        }
        const hashTx = this.calculateHash();
        const sig = signingKey.sign(hashTx, 'base64');
        this.signature = sig.toDER('hex');
    }

    isValid(){
        if (this.fromAddress === null) return true;
        if (!this.signature || this.signature.length === 0) {
            throw new Error('No signature in this record');
        }
        if (this.value < 1 || this.value > 5) {
            throw new Error('record must be between 1 and 5 inclusive');
        }
        const publicKey = ec.keyFromPublic(this.fromAddress, 'hex');
        return publicKey.verify(this.calculateHash(), this.signature);
    }
}

class Block {
    constructor(timestamp, records, previousHash = '') {
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.records = records;
        this.hash = this.calculateHash();
        this.nonce = 0;
    }

    calculateHash() {
        return SHA256(this.previousHash + this.timestamp + JSON.stringify(this.records) + this.nonce).toString();
    }

    // Proof of Work
    mineBlock(difficulty) {
        while (this.hash.substring(0, difficulty) !== Array(difficulty + 1).join("0")) {
            this.nonce++;
            this.hash = this.calculateHash();
        }
        console.log("Block Mined: " + this.hash);
    }

    hasValidRecords() {
        for (const record of this.records) {
            if (!record.isValid()) return false;
        }
        return true;
    }
}

class Blockchain {
    constructor() {
        this.chain = [this.createGenesisBlock()];
        this.difficulty = 4;
        this.pendingRecords = [];
        this.miningReward = 5;
    }

    createGenesisBlock() {
        return new Block("01/01/2021", "Genesis block", "0");
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    minePendingRecords(miningRewardAddress){
        // Practically, this should be more targetted to account for high volume of records and limited block size
        let block = new Block(Date.now(), this.pendingRecords, this.getLatestBlock().hash);
        block.mineBlock(this.difficulty);

        console.log('Block successfully mined!');
        this.chain.push(block);

        // Miner gets courtesy 5 star record when the next block is mined
        this.pendingRecords = [
            new Record(null, miningRewardAddress, this.miningReward)
        ];
    }

    addRecord(record) {
        if (!record.fromAddress || !record.toAddress) {
            throw new Error('record must include to and from address');
        }
        if (!record.isValid()) {
            throw new Error('Cannot add invalid record to chain');
        }
        this.pendingRecords.push(record);
    }

    getRecordsOfAddress(address) {
        let records = 0;
        let score = 0;
        let totalRecords = 0;

        // TODO change from voting karma system to vin / title record system
        for(const block of this.chain) {
            for(const record of block.records) {
                if (record.toAddress === address) {
                    totalRecords++;
                    records += record.value;
                }
            }
        }
        if (totalrecords !== 0) score = records / totalRecords;
        return score;
    }

    isChainValid() {
        for (let i = 1; i < this.chain.length; i++){
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i-1];

            if (!currentBlock.hasValidRecords()) return false;
            if (currentBlock.hash !== currentBlock.calculateHash()) return false;
            if (currentBlock.previousHash !== previousBlock.hash) return false;
        }
        return true;
    }
}
module.exports.Blockchain = Blockchain;
module.exports.record = record;