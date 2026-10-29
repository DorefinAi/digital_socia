import { redirect } from "next/navigation";
import { REJECTED_NEWS_PATH } from "@/lib/rejectedNews";

// The Approval Portal became Rejected news; old links and bookmarks land there.
export default function ApprovalPage() {
  redirect(REJECTED_NEWS_PATH);
}
