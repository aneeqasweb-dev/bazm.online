import { customerNameSchema, emailSchema } from "@bazm/domain";
import { z } from "zod";

export const registrationSchema = z
  .object({
    name: customerNameSchema,
    email: emailSchema,
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .regex(/[a-z]/, "Add a lowercase letter.")
      .regex(/[A-Z]/, "Add an uppercase letter.")
      .regex(/[0-9]/, "Add a number."),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type RegistrationInput = z.infer<typeof registrationSchema>;
