import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AtlasPage } from "./features/atlas/AtlasPage";
import { AuthContext } from "./features/auth/authContext";
import { ActiveCollectionContext } from "./features/collections/activeCollectionContext";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthContext.Provider
      value={{
        session: null,
        user: { id: "preview-user", email: "marco@geotrainer.app" } as never,
        loading: false,
        configurationError: null,
        sessionError: null,
        signIn: async () => ({ error: null }),
        signUp: async () => ({ error: null }),
        signOut: async () => ({ error: null }),
      }}
    >
      <ActiveCollectionContext.Provider
        value={{
          collections: [
            {
              id: "preview",
              name: "Mes indices GeoGuessr",
              description: null,
              owner_id: "preview-user",
              created_at: "2026-06-10T00:00:00.000Z",
              updated_at: "2026-06-10T00:00:00.000Z",
              role: "owner",
            },
          ],
          activeCollection: {
            id: "preview",
            name: "Mes indices GeoGuessr",
            description: null,
            owner_id: "preview-user",
            created_at: "2026-06-10T00:00:00.000Z",
            updated_at: "2026-06-10T00:00:00.000Z",
            role: "owner",
          },
          activeCollectionId: "preview",
          setActiveCollectionId: () => undefined,
          isLoading: false,
          error: null,
        }}
      >
        <AtlasPage />
      </ActiveCollectionContext.Provider>
    </AuthContext.Provider>
  </BrowserRouter>,
);
