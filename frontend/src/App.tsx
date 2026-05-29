import { useEffect, useState } from "react";
import { apiClient } from "./api/client";

function App() {
  const [status, setStatus] = useState<string>("checking...");

  useEffect(() => {
    apiClient
      .get("/health")
      .then((res) => {
        setStatus(res.data.status);
      })
      .catch(() => {
        setStatus("backend error");
      });
  }, []);

  return (
    <main style={{ padding: 32 }}>
      <h1>Freelance AI Secretary</h1>
      <p>Backend status: {status}</p>
    </main>
  );
}

export default App;