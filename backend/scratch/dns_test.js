const dns = require('dns');

console.log('Setting DNS servers to 8.8.8.8...');
dns.setServers(['8.8.8.8']);

console.log('Resolving cluster0.lmh25dh.mongodb.net with dns.resolve4...');
dns.resolve4('cluster0.lmh25dh.mongodb.net', (err, addresses) => {
  if (err) {
    console.error('dns.resolve4 failed:', err);
  } else {
    console.log('dns.resolve4 addresses:', addresses);
  }
});

console.log('Resolving _mongodb._tcp.cluster0.lmh25dh.mongodb.net with dns.resolveSrv...');
dns.resolveSrv('_mongodb._tcp.cluster0.lmh25dh.mongodb.net', (err, addresses) => {
  if (err) {
    console.error('dns.resolveSrv failed:', err);
  } else {
    console.log('dns.resolveSrv addresses:', addresses);
  }
});

console.log('Resolving ac-sh7uacu-shard-00-00.lmh25dh.mongodb.net with dns.resolve4...');
dns.resolve4('ac-sh7uacu-shard-00-00.lmh25dh.mongodb.net', (err, addresses) => {
  if (err) {
    console.error('dns.resolve4 for shard failed:', err);
  } else {
    console.log('dns.resolve4 for shard addresses:', addresses);
  }
});
