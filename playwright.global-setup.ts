import { createServer } from "vite";

export default async function globalSetup() {
  const server = await createServer({
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
    },
  });

  try {
    await server.listen();
  } catch (error) {
    await server.close();
    throw error;
  }

  return async () => {
    await server.close();
  };
}
