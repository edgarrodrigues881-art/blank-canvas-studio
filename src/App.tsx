import { BrowserRouter, Routes, Route } from "react-router-dom";

const BlankPage = () => (
  <div className="min-h-screen bg-background" />
);

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="*" element={<BlankPage />} />
    </Routes>
  </BrowserRouter>
);

export default App;
