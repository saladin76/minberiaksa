import { templateButtonProblem } from "./template-locale-media";
import { z } from "zod";

export const headerSchema = z.object({
  type: z.enum(["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION"]).default("NONE"),
  text: z.string().max(60).nullable().optional(),
  exampleHandle: z.string().max(4096).nullable().optional(),
  mediaUrl: z.string().max(4096).nullable().optional(),
  mediaPublicId: z.string().max(512).nullable().optional(),
  previewUrl: z.string().max(4096).nullable().optional(),
  fileName: z.string().max(255).nullable().optional(),
  mimeType: z.string().max(120).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  address: z.string().max(256).nullable().optional(),
});

export const buttonSchema = z.object({
  type: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER"]),
  text: z.string().min(1).max(25),
  url: z.string().max(2048).nullable().optional(),
  phoneNumber: z.string().max(32).nullable().optional(),
  example: z.string().max(512).nullable().optional(),
});

export const templateButtonsSchema = z.array(buttonSchema).max(10).superRefine((buttons,ctx)=>{const problem=templateButtonProblem(buttons);if(problem)ctx.addIssue({code:z.ZodIssueCode.custom,message:problem});});

export const authSchema = z.object({
  addSecurityRecommendation: z.boolean().default(true),
  codeExpirationMinutes: z.number().int().min(1).max(90).default(10),
  otpType: z.enum(["COPY_CODE", "ONE_TAP"]).default("COPY_CODE"),
  buttonText: z.string().min(1).max(25).default("Copy Code"),
  autofillText: z.string().max(25).nullable().optional(),
  packageName: z.string().max(255).nullable().optional(),
  signatureHash: z.string().max(255).nullable().optional(),
}).nullable().optional();

export const translationSchema = z.object({
  header: headerSchema.optional(),
  body: z.string().max(1024).optional(),
  headerText: z.string().max(60).nullable().optional(),
  footerText: z.string().max(60).nullable().optional(),
  buttons: templateButtonsSchema.optional(),
});
