'use client';

import { CourseForm, emptyCourse } from '../_components/CourseForm';

export default function NewCoursePage() {
  return <CourseForm mode="create" initial={emptyCourse()} />;
}
