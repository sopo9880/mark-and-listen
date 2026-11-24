import { buildBetaServer } from './beta-server.mjs';

const smoke = process.env.MARK_LISTEN_SMOKE === '1';
try {
  const { server } = await buildBetaServer({ autoUpdate: !smoke, smoke });
  server.once('error', (error) => {
    console.error('Mark & Listen backend failed to bind:', error.message);
    process.exit(1);
  });
  server.listen(Number(process.env.PORT ?? 4173), '127.0.0.1', () => {
    console.log('MARK_READY:' + server.address().port);
  });
  if (process.env.MARK_LISTEN_PARENT_PIPE === '1') {
    process.stdin.once('end', () => {
      server.closeAllConnections();
      server.close();
    });
    process.stdin.resume();
  }
} catch (error) {
  console.error('Mark & Listen backend failed to start:', error.message);
  process.exitCode = 1;
}
