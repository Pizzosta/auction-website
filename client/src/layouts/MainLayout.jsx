import { Outlet } from "react-router-dom";
import { Suspense } from "react";
//import Navbar from "../components/Navbar";
import OldFooter from "../components/OldFooter";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";

const MainLayout = () => {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/*<Navbar />*/}
      <Header />
      <main className="flex-grow container mx-auto px-4 py-6">
        <Suspense
          fallback={
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      {/*<Footer />*/}
      <OldFooter />
    </div>
  );
};

export default MainLayout;
