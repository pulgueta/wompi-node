import React from "react";
import { createRoot } from "react-dom/client";
import { WompiProvider, useWompi } from "@pulgueta/react-wompi";

function Products() {
  const { scriptStatus, client } = useWompi();
  const [token, setToken] = React.useState<string | null>(null);

  const createToken = async () => {
    if (scriptStatus !== "ready") return;
    const res = await client.tokens.createCardToken({
      number: "4242424242424242",
      cvc: "123",
      exp_month: "12",
      exp_year: "29",
      card_holder: "Test User",
    });
    setToken(res.data.id);
  };

  return (
    <div>
      <h1>Mock products</h1>
      <button onClick={createToken} disabled={scriptStatus !== "ready"}>Create card token</button>
      {token && <p>Token: {token}</p>}
    </div>
  );
}

function App() {
  return (
    <WompiProvider publicKey={import.meta.env.VITE_WOMPI_PUBLIC_KEY} environment="sandbox">
      <Products />
    </WompiProvider>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

