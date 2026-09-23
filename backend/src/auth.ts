import type { NextFunction, Request, Response } from "express";
import { API_SECRET } from "./config";

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  if (!API_SECRET) {
    res.status(500).json({ error: "Backend is missing API_SECRET configuration." });
    return;
  }

  const provided = req.header("x-api-key");
  if (provided !== API_SECRET) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  next();
}
