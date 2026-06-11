import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.email("Saisissez une adresse email valide."),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères."),
});

export type Credentials = z.infer<typeof credentialsSchema>;
