import React from "react";
import { createRoot } from "react-dom/client";
import SolutionsTable from "./SolutionsTable.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SolutionsTable />
  </React.StrictMode>
);
