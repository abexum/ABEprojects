const { Blockchain, Record } = require('./titleChain');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

// use this space to test the block chain
// in terminal enter:
// node main.js

const myKey = ec.keyFromPrivate('db4ae300b06e0d8d19bc2f68909129ca4b580d50abda1d146acee2852e9402ce');
const myRecordAddress = myKey.getPublic('hex');

let titleChain = new Blockchain();
// this test user is voting themself, probably shouldnt be allowed
const vt1 = new Record(myRecordAddress, '045a12d5f65afce6b13a59029d8ab12617d3c470198755a8c1248f46cc639a2d6bdd12cab86935b65d1f8ee9f21b16ee5961ca1d1f01187e8b374b99b3b9004918', 1);
vt1.signRecord(myKey);
titleChain.addRecord(vt1);

//karmaCoin.addVote(new Vote('user1', 'user2', 1));
//karmaCoin.addVote(new Vote('user2', 'user1', 5));

console.log('\n Starting the miner...');
titleChain.minePendingRecords(myRecordAddress);

console.log('\nBalance of GSchest is', titleChain.getRecordsOfAddress(myRecordAddress));
