const { ethers } = require('ethers');
async function check() {
  const provider = new ethers.JsonRpcProvider('https://data-seed-prebsc-1-s1.binance.org:8545');
  const address = '0x02252Db03aF7CD8C8d3eC6CFd3AE5f6dab69ACd0';
  const balance = await provider.getBalance(address);
  console.log('BALANCE:' + ethers.formatEther(balance));
}
check();
