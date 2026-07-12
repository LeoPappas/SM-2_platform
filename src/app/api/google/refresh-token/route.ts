import { NextResponse } from "next/server";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export async function POST(request: Request) {
  let refreshToken: string | undefined;

  try {
    const body = (await request.json()) as { refreshToken?: string };
    refreshToken = body.refreshToken;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!refreshToken) {
    return NextResponse.json({ error: "Missing Google refresh token." }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Google OAuth refresh is not configured." }, { status: 500 });
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !data.access_token) {
    return NextResponse.json(
      { error: data.error_description ?? data.error ?? "Unable to refresh Google token." },
      { status: response.status },
    );
  }

  return NextResponse.json({
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  });
}
