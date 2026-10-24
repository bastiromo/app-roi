"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { sha256Hex, TRUST_COOKIE } from "@/lib/trusted-device";

async function currentHash() {
  const token = (await cookies()).get(TRUST_COOKIE)?.value;
  return token ? sha256Hex(token) : null;
}

export async function forgetDevice(id: string): Promise<void> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("trusted_devices").delete().eq("id", id).select("token_hash");
  const mine = await currentHash();
  if (mine && data?.some((d) => d.token_hash === mine)) (await cookies()).delete(TRUST_COOKIE);
  revalidatePath("/dispositivos");
}

export async function forgetAllDevices(): Promise<void> {
  const { supabase, user } = await requireUser();
  await supabase.from("trusted_devices").delete().eq("user_id", user.id);
  (await cookies()).delete(TRUST_COOKIE);
  revalidatePath("/dispositivos");
}
