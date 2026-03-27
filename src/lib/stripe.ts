import { loadStripe } from "@stripe/stripe-js";

const STRIPE_PUBLISHABLE_KEY =
  "pk_live_51TCpZYQPHadMvLOnfo634ipc1ScoJjgza6u9YvPcaXktW4LcroEq7qcvY69H2XfvjMh49zgU4Hc5AooP3kzlaAS9005Dkfctrg";

// Singleton — loadStripe is called only once
export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

/**
 * Redirects the user to a Stripe Checkout session.
 */
export function redirectToCheckout(checkoutUrl: string) {
  window.location.href = checkoutUrl;
}

/**
 * Calls the backend to create a checkout session and redirects.
 */
export async function startCheckout(payload: {
  planName: string;
  instances: number | string;
  price: string;
}) {
  const { supabase } = await import("@/integrations/supabase/client");

  const { data, error } = await supabase.functions.invoke(
    "create-checkout-session",
    { body: payload }
  );

  if (error) {
    console.error("Checkout invoke error:", error);
    throw new Error("Erro ao conectar com o servidor de pagamento.");
  }

  if (!data?.url) {
    console.error("Checkout response without url:", data);
    throw new Error(data?.error || "Não foi possível iniciar o checkout.");
  }

  // Redirect to Stripe Checkout
  window.location.href = data.url;
}
