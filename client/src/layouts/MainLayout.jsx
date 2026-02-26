import { Outlet } from "react-router-dom";
import { Suspense } from "react";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import Spinner from "../components/Spinner";

const MainLayout = () => {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner fullScreen label="Loading page..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-6">
        <Suspense
         fallback={<Spinner fullScreen label="Loading page..."/>}
        >
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
};

export default MainLayout;
