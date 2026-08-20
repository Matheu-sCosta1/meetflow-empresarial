import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../app/globals.css";
import LocalApp from "../../app/local-app";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento raiz da aplicação não encontrado");

createRoot(root).render(
  <StrictMode>
    <LocalApp />
  </StrictMode>,
);
