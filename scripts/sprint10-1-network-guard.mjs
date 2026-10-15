// Acceptance child processes have no outgoing sockets, even to loopback/4318.
// Gateway listens for incoming requests and reaches MCP exclusively through stdio.
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import dgram from 'node:dgram';
import { syncBuiltinESMExports } from 'node:module';
const deny = () => {
  throw Error('Acceptance network isolation: outgoing connection prohibited');
};
net.Socket.prototype.connect = deny;
net.connect = deny;
net.createConnection = deny;
tls.connect = deny;
const lookup = dns.lookup;
dns.lookup = (hostname, ...args) => {
  if (!net.isIP(hostname)) return deny();
  return lookup(hostname, ...args); // Numeric bind address: no DNS traffic.
};
dns.resolve = deny;
dns.promises.lookup = deny;
dns.promises.resolve = deny;
dgram.createSocket = deny;
globalThis.fetch = deny;
syncBuiltinESMExports();
