const dotenv = require('dotenv');
const fetch = require('node-fetch');
const keccak256 = require('keccak256');
const express = require('express');
const BN = require('bn.js');

dotenv.config();

const port = process.env.PORT || 3012;
const rpc = process.env.CHAIN_RPC || '';
const tokenContract = process.env.TOKEN_CONTRACT || '';
const lockedAddrs = process.env.LOCKED_ADDRS ? process.env.LOCKED_ADDRS.split(',') : [];
const isSupertoken = process.env.IS_SUPERTOKEN === 'true' || false;

const app = express();

async function ethCall(contract, func, params = '') {
  const funcSelector = keccak256(func).toString('hex').substr(0, 8);
  const data = {
    method: 'eth_call',
    params: [
      {
        to: contract,
        data: '0x' + funcSelector + '000000000000000000000000' + params.replaceAll('0x', '')
      }
    ],
    id: 1,
    jsonrpc: '2.0'
  };

  // todo: error handling
  const resp = await fetch(rpc, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  const respJson = await resp.json();
  return respJson.result;
}

app.get('/', (req, res) => {
  res.set('content-type', 'text/plain');
  res.send(
    'Hello World! Check out <a href="/circulating">/circulating</a>'
    + (isSupertoken ? ' and <a href="/streaming-rate-to-circulating-per-year">/streaming-rate-to-circulating-per-year</a>' : '')
    +'.'
  );
});

app.get('/circulating', async (req, res) => {

  // get decimals
  const decimalsResp = await ethCall(tokenContract, 'decimals()', '');
  const decimals = parseInt(decimalsResp, 16);
  console.log('decimals', decimals);

  // get total supply
  const supplyResp = await ethCall(tokenContract, 'totalSupply()', '');
  const totalSupply = parseInt(supplyResp, 16);
  console.log('totalSupply', totalSupply / Math.pow(10, decimals));

  // get token balances
  const balances = await Promise.all(lockedAddrs.map(async (addr) => {
    const balanceResp = await ethCall(tokenContract, 'balanceOf(address)', addr);
    const balance = parseInt(balanceResp, 16);
    console.log(`balanceOf(${addr})`, balance / Math.pow(10, decimals));
    return balance;
  }));
  //console.log(balances);

  const balancesSum = balances.reduce((acc, curr) => acc + curr);
  console.log('balancesSum', balancesSum / Math.pow(10, decimals));

  const circulating = totalSupply - balancesSum;
  console.log('circulating', circulating / Math.pow(10, decimals));

  res.set('content-type', 'text/plain');
  res.send(`${circulating / Math.pow(10, decimals)}`);
});

if (isSupertoken) {
  app.get('/streaming-rate-to-circulating-per-year', async (req, res) => {
    // get decimals
    const decimalsResp = await ethCall(tokenContract, 'decimals()', '');
    const decimals = parseInt(decimalsResp, 16);
    console.log('decimals', decimals);

    // todo: for supertokens, get distribution rate

    const nrMaxBN = new BN("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", 16);
    const nrHalfBN = new BN("8000000000000000000000000000000000000000000000000000000000000000", 16);
    //getNetFlow()
    const netFlows = await Promise.all(lockedAddrs.map(async (addr) => {
      //todo: put '0xEbdA4ceF883A7B12c4E669Ebc58927FBa8447C7D' in env...
      const netFlowResp = await ethCall('0xEbdA4ceF883A7B12c4E669Ebc58927FBa8447C7D', 'getNetFlow(address,address)', tokenContract + '000000000000000000000000' + addr);

      const netFlowBn = new BN(netFlowResp.replaceAll('0x', ''), 16);
      // todo: check if this is correct
      if (netFlowBn.gte(nrHalfBN)) {
        console.log(
          `netFlowResp(-,${addr})`,
          netFlowResp,
          (60 * 60 * 24 * 365) * parseInt(netFlowBn.xor(nrMaxBN).toString(), 10) / Math.pow(10, decimals)
        );
        return parseInt(netFlowBn.xor(nrMaxBN).toString(), 10);
      }
      console.log(
        `netFlowResp(-,${addr})`,
        netFlowResp,
        (60 * 60 * 24 * 365) * parseInt(netFlowBn.toString(), 10) / Math.pow(10, decimals)
      );
      return parseInt(netFlowBn.toString(), 10);
    }));
    //console.log(netFlows);

    const netFlowsSum = netFlows.reduce((acc, curr) => acc + curr);
    console.log('netFlowsSum', netFlowsSum / Math.pow(10, decimals));

    res.set('content-type', 'text/plain');
    res.send(`${(60 * 60 * 24 * 365) * netFlowsSum / Math.pow(10, decimals)}`);
  });
}

app.listen(port, () => {
  console.log(rpc, tokenContract, lockedAddrs, isSupertoken);
  console.log(`Listening at http://localhost:${port}`)
});
