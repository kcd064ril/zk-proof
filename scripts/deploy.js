const { ethers } = require("ethers");
const { utils } = require("ffjavascript");
const fs = require("fs");
const snarkjs = require("snarkjs");
const hardhat = require("hardhat");

const BASE_PATH = "./circuits/zkcircuit/";

function p256(n) {
  // Convert number to hexadecimal string representation
  let nstr = n.toString(16);
  while (nstr.length < 64) nstr = `0${nstr}`;
  nstr = `0x${nstr}`;
  return ethers.BigNumber.from(nstr);
}

async function generateCallData() {
  // Generate the proof and convert it to BigInt representation
  const zkProof = await generateProof();
  const proof = utils.unstringifyBigInts(zkProof.proof);
  const pub = utils.unstringifyBigInts(zkProof.publicSignals);

  let inputs = "";
  // Convert public inputs to hexadecimal BigNumber representation
  for (let i = 0; i < pub.length; i++) {
    if (inputs) inputs += ",";
    inputs += p256(pub[i]);
  }

  // Convert proof values to hexadecimal BigNumber representation
  const pi_a = [p256(proof.pi_a[0]), p256(proof.pi_a[1])];
  const pi_b = [
    [p256(proof.pi_b[0][1]), p256(proof.pi_b[0][0])],
    [p256(proof.pi_b[1][1]), p256(proof.pi_b[1][0])],
  ];
  const pi_c = [p256(proof.pi_c[0]), p256(proof.pi_c[1])];
  const input = [inputs];

  return { pi_a, pi_b, pi_c, input };
}

async function generateProof() {
  // Read input data from file
  const inputData = fs.readFileSync(`${BASE_PATH}input.json`, "utf8");
  const input = JSON.parse(inputData);

  // Calculate the witness for the circuit
  const out = await snarkjs.wtns.calculate(
    input,
    `${BASE_PATH}out/circuit.wasm`,
    `${BASE_PATH}out/circuit.wtns`
  );

  // Generate the proof using the circuit witness and proving key
  const proof = await snarkjs.groth16.prove(
    `${BASE_PATH}out/circuit.zkey`,
    `${BASE_PATH}out/circuit.wtns`
  );

  // Write the generated proof to a file
  fs.writeFileSync(`${BASE_PATH}out/proof.json`, JSON.stringify(proof, null, 1));

  return proof;
}

async function main() {
  // Deploy the ZkProof contract
  const ZkProof = await hardhat.ethers.getContractFactory(
    "./contracts/ZkProof.sol:ZkProof"
  );
  const zkproof = await ZkProof.deploy();
  await zkproof.deployed();
  console.log(`ZkProof deployed to ${zkproof.address}`);

  // Generate the call data
  const { pi_a, pi_b, pi_c, input } = await generateCallData();

  // Verify the proof using the ZkProof contract
  const txn = await zkproof.verifyProof(pi_a, pi_b, pi_c, input);
  console.log(`ZkProof result: ${txn}`);
  console.assert(txn === true, "verification proof failed!");

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});