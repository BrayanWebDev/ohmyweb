import { useState } from "react";
import Scene from "./components/Scene/Scene";
import "./styles/global.css";

export default function App() {
  const [stage, setStage] = useState("nebula");

  return (
    <div className="app">
      <div className="debug">
        <button onClick={() => setStage("nebula")}>nebula</button>
        <button onClick={() => setStage("star")}>star</button>
        <button onClick={() => setStage("supergiant")}>supergiant</button>
        <span>stage: {stage}</span>
      </div>

      <Scene stage={stage} />
    </div>
  );
}
