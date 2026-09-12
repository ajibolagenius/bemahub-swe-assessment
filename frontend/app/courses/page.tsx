"use client";

import { useQuery } from "@tanstack/react-query";
import { getCourses } from "@/lib/api/services/courses";
import { StatusMessage } from "@/components/StatusMessage";
import { formatMoney, formatNullableNumber } from "@/lib/format";

export default function CoursesPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["courses"],
    queryFn: getCourses,
    // Respect previewExpiresInSeconds: mark data stale after the server TTL (300 seconds = 5 minutes)
    staleTime: 300 * 1000,
  });

  if (isLoading) {
    return <StatusMessage state="loading" />;
  }

  if (isError) {
    const message = error instanceof Error ? error.message : "Failed to load courses.";
    return <StatusMessage state="error" message={message} />;
  }

  const courses = data?.courses ?? [];

  if (courses.length === 0) {
    return <StatusMessage state="empty" message="No published courses found." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Available Courses</h2>
        <p className="text-sm text-slate-500">Explore courses published by our instructors.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {courses.map((course) => (
          <div
            key={course.id}
            className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div>
              <h3 className="text-lg font-semibold text-slate-800">{course.title}</h3>
              <p className="mt-1 text-sm text-slate-500">Instructor: {course.instructorName}</p>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3 text-sm space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Price:</span>
                <span className="font-medium text-slate-900">
                  {formatMoney(course.priceMinor, course.currency)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Enrolments:</span>
                <span className="font-medium text-slate-900">
                  {formatNullableNumber(course.enrolmentCount)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Rating:</span>
                <span className="font-medium text-slate-900">
                  {formatNullableNumber(course.averageRating)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
