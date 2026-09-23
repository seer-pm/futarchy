import Companies from "../components/futarchyFi/companyList/page/CompaniesPage";

export default function Home() {
  return <Companies />;
}

export async function getStaticProps() {
  return {
    props: {},
  };
}
