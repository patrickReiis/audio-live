import { BrowserRouter, Route, Routes } from "react-router-dom";

import Index from "./pages/Index";
import RecordingPage from "./pages/RecordingPage";
import NotFound from "./pages/NotFound";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/recording" element={<RecordingPage />} />
        <Route path="/recording/:sessionId" element={<RecordingPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
export default AppRouter;