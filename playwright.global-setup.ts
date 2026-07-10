import { createServer } from "vite";

const PLAYWRIGHT_PORT = 4173;

export default async function globalSetup() {
  let ownedServer: Awaited<ReturnType<typeof createServer>> | null = null;
  const server = await createServer({
    server: {
      host: "127.0.0.1",
      port: PLAYWRIGHT_PORT,
      strictPort: true,
    },
  });

  try {
    await server.listen();
    ownedServer = server;
  } catch (error) {
    await server.close();

    if (
      error instanceof Error &&
      /already in use|EADDRINUSE/i.test(error.message)
    ) {
      return async () => undefined;
    }

    throw error;
  }

  return async () => {
    await ownedServer?.close();
  };
}
